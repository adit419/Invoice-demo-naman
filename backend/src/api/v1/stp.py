"""
Straight-Through Processing (STP) — global setting.

When enabled, any invoice uploaded (manual or email) is automatically
processed end-to-end by the system:
  ingestion → extraction → metadata_validation
  → line_item_matching → bill_posting (Zoho) → completed

Processing stops if a mandatory-field check fails (validation_failure).
System errors (Zoho 502, etc.) are caught and logged — the invoice stays
at whatever stage it reached.
"""
import asyncio
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import app_settings, bills, email_log, executed_stages, invoices, pipeline_runs, po_recommendations
from ...models.user import UserOut
from ...services.fixtures import get_loader
from fastapi import HTTPException
from .stages import STAGE_DISPLAY, STAGE_SEQUENCE, approve_stage

router = APIRouter(tags=["stp"])
logger = logging.getLogger(__name__)

# Derived from STAGE_SEQUENCE (single source of truth) so the STP cascade
# never drifts from the actual forward flow. vendor_validation was removed
# from STAGE_SEQUENCE (folded into the Matching page) — extraction now
# transitions straight to metadata_validation, so STP must not wait on it.
_VALIDATION_STAGES = [
    s for s in STAGE_SEQUENCE if s not in ("ingestion", "bill_posting")
]

_STP_ACTOR = UserOut(
    id="000000000000000000000001",
    email="stp@neoflo.ai",
    full_name="STP System",
    role="tenant_admin",
    is_active=True,
    tenant_id=None,
    created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
)


# ── Global STP state (persisted in app_settings) ──────────────────────────────

async def get_global_stp(db) -> bool:
    doc = await app_settings(db).find_one({"key": "global_stp"})
    return bool(doc.get("value", False)) if doc else False


async def set_global_stp(db, enabled: bool) -> None:
    await app_settings(db).update_one(
        {"key": "global_stp"},
        {"$set": {"value": enabled, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


# ── Mandatory-field cascade through validation stages ─────────────────────────

async def _wait_for_in_review(db, run_id: ObjectId, slug: str, attempts: int = 15) -> bool:
    """Poll until the stage reaches in_review. Returns True if successful."""
    for _ in range(attempts):
        doc = await executed_stages(db).find_one({"run_id": run_id, "stage_slug": slug})
        if doc and doc.get("status") == "in_review":
            return True
        await asyncio.sleep(0.3)
    doc = await executed_stages(db).find_one({"run_id": run_id, "stage_slug": slug})
    logger.warning("STP: %s did not reach in_review — status=%s", slug, (doc or {}).get("status"))
    return False


async def _cascade_validation(db, run_id: ObjectId) -> dict:
    """
    Auto-approve each validation stage sequentially.
    approve_stage() enforces mandatory field rules — catches the 422 here.

    Stages that don't apply are skipped rather than aborting the cascade:
      - fp_extraction for non-IDR invoices (approve_stage auto-skips it, so it
        never reaches in_review — waiting on it stalled every non-IDR run);
      - stages already approved/completed (by a human or an earlier cascade),
        which makes this safe to re-run as a *resume* after human intervention.
    """
    stages_approved: list[str] = []
    failure_reason: str | None = None

    inv_doc = await invoices(db).find_one({"run_id": run_id}) or {}
    is_idr = (inv_doc.get("currency") or "").upper() == "IDR"

    for slug in _VALIDATION_STAGES:
        if slug == "fp_extraction" and not is_idr:
            continue

        stage_doc = await executed_stages(db).find_one({"run_id": run_id, "stage_slug": slug}) or {}
        if stage_doc.get("status") in ("approved", "completed"):
            continue

        ready = await _wait_for_in_review(db, run_id, slug)
        if not ready:
            logger.error("STP: aborting cascade at %s — stage never reached in_review", slug)
            failure_reason = "stage_not_ready"
            break

        # Demo realism: let extraction "run" for a few seconds before the
        # system acts on it, mirroring real OCR / field-extraction latency
        # (the dashboard shows the Processing state during this window).
        if slug == "extraction":
            await asyncio.sleep(5)

        # An AI-recommended PO must be reviewed by a human before the pipeline
        # moves on — STP never auto-approves extraction over a Neo AI fill.
        # The human approving extraction resumes the cascade from there.
        if slug == "extraction":
            rec = await po_recommendations(db).find_one({"run_id": run_id})
            if rec and rec.get("status") == "applied":
                logger.info(
                    "STP: AI PO recommendation applied for run %s — holding at "
                    "extraction for human review", run_id,
                )
                failure_reason = "ai_recommendation_pending_review"
                break

        # Line items only auto-approve when every match is "perfect". A
        # probable (or missing) match needs a human to confirm the GRN mapping
        # — STP holds here and resumes once the stage is approved.
        if slug == "line_item_matching":
            run_doc = await pipeline_runs(db).find_one({"_id": run_id}) or {}
            bundle = get_loader().discover().get(run_doc.get("fixture_key", ""))
            li_fixture = bundle.line_item if bundle else {}
            if isinstance(li_fixture, list):
                li_fixture = li_fixture[0] if li_fixture else {}
            non_perfect = [
                r for r in li_fixture.get("results", [])
                if r.get("match_status") != "perfect"
            ]
            if non_perfect:
                logger.info(
                    "STP: %d line item(s) without a perfect match for run %s — "
                    "holding at line_item_matching for human review",
                    len(non_perfect), run_id,
                )
                failure_reason = "line_items_pending_review"
                break

        try:
            await approve_stage(db, run_id, slug, _STP_ACTOR, f"{slug}.stp_approved")
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            missing = detail.get("missing", [])
            logger.warning(
                "STP: mandatory fields missing at %s for run %s — %s. "
                "Waiting for human review; STP resumes after the stage is approved.",
                slug, run_id, missing,
            )
            failure_reason = "mandatory_fields_missing"
            break

        stages_approved.append(slug)
        logger.info("STP: approved %s for run %s", slug, run_id)
        await asyncio.sleep(3)

    return {
        "stages_approved": stages_approved,
        "reason": "ready_for_bill_posting" if failure_reason is None else failure_reason,
        "completed": False,
    }


# ── Auto bill-posting ─────────────────────────────────────────────────────────

from ._common import _envelope, _extract_field


def _unwrap(data) -> dict:
    if isinstance(data, list) and data:
        return data[0]
    return data if isinstance(data, dict) else {}


async def _auto_post_bill(db, run_id: ObjectId) -> dict:
    """
    STP bill posting — posts to Zoho Books with the *same* request the manual
    "Post to ERP" handler (`post_bill_to_erp`) makes, so the email/STP flow
    produces a real Zoho bill and bill-attachment deep-link instead of a
    fixture stub with an empty `zoho_url`.
    """
    from ...services.invoice_state import get_invoice_schema
    from ...services.qbd_bill import post_bill as qbd_post_bill
    from ...services.zoho_bill import post_bill as zoho_post_bill
    from .bill_posting import _resolve_bill_line_items

    run = await pipeline_runs(db).find_one({"_id": run_id}) or {}
    fixture_key = run.get("fixture_key", "")
    # Live extraction state: fixture extraction.json + replayed edit_history
    invoice_schema = await get_invoice_schema(db, run_id)

    loader = get_loader()
    bundle = loader.discover().get(fixture_key)
    bp_fixture = _unwrap(bundle.bill_posting if bundle else {})

    # Apply any saved overrides from the bills collection (mirrors manual flow)
    saved = await bills(db).find_one({"run_id": run_id}) or {}
    overrides = saved.get("line_item_overrides", {})
    line_items = _resolve_bill_line_items(invoice_schema, bp_fixture, overrides)

    header = bp_fixture.get("bill_header", {})
    vendor_name = _extract_field(invoice_schema, "vendor_name") or header.get("vendor_name", "")
    bill_date = saved.get("invoice_date") or _extract_field(invoice_schema, "invoice_date") or header.get("bill_date", "")
    due_date = saved.get("due_date") or header.get("due_date", "")
    reference = header.get("reference", "")
    currency = _extract_field(invoice_schema, "currency") or header.get("currency", "")
    erp_type = bp_fixture.get("erp_type") or ("qbd" if fixture_key == "CATERSPOT_QBDE" else "zoho")

    now = datetime.now(timezone.utc)

    if erp_type == "qbd":
        qbd_vendor_ref = header.get("qbd_vendor_ref") or vendor_name
        try:
            qbd_result = await qbd_post_bill(
                vendor_name=qbd_vendor_ref,
                bill_date=bill_date,
                due_date=due_date,
                reference_number=reference,
                currency_code=currency,
                fixture_key=fixture_key,
                line_items=[
                    {
                        "item_ref": li.get("item_ref") or li.get("description", ""),
                        "description": li.get("description", ""),
                        "quantity": li.get("quantity", 1),
                        "unit_price": li.get("unit_price", 0),
                    }
                    for li in line_items
                ],
            )
        except Exception as exc:
            raise RuntimeError(f"QB Desktop error: {exc}") from exc

        erp_result = {
            "run_id": run_id,
            "erp_type": "qbd",
            "bill_id": qbd_result["bill_id"],
            "bill_number": qbd_result["bill_number"],
            "zoho_reference": qbd_result.get("ref_number", reference),
            "zoho_url": "",
            "status": "posted",
            "posted_at": now,
            "notification_email": "",
            "vendor_name": vendor_name,
            "total": header.get("total", 0),
            "currency": header.get("currency", ""),
        }
    else:
        try:
            zoho_result = await zoho_post_bill(
                vendor_name=vendor_name,
                bill_date=bill_date,
                due_date=due_date,
                reference_number=reference,
                currency_code=currency,
                tax_amount=float(header.get("tax_amount") or 0),
                wht_amount=float(header.get("wht") or 0),
                line_items=[
                    {
                        "description": li.get("description", ""),
                        "account_id": li.get("account_id"),
                        "account_code": li.get("account_code", ""),
                        "account_name": li.get("account_name", ""),
                        "tax_id": li.get("tax_id"),
                        "quantity": li.get("quantity", 1),
                        "unit_price": li.get("unit_price", 0),
                    }
                    for li in line_items
                ],
            )
        except Exception as exc:
            # Mirror the manual flow: a Zoho failure must abort posting. The STP
            # cascade's outer handler logs this and leaves the run at bill_posting.
            raise RuntimeError(f"Zoho Books error: {exc}") from exc

        erp_result = {
            "run_id": run_id,
            "erp_type": "zoho",
            "bill_id": zoho_result["bill_id"],
            "bill_number": zoho_result["bill_number"],
            "zoho_reference": zoho_result["zoho_reference"],
            "zoho_url": zoho_result.get("zoho_url", ""),
            "status": "posted",
            "posted_at": now,
            "notification_email": "",
            "vendor_name": vendor_name,
            "total": header.get("total", 0),
            "currency": header.get("currency", ""),
        }

    await bills(db).update_one(
        {"run_id": run_id},
        {"$set": {**erp_result, "updated_at": now}},
        upsert=True,
    )

    await email_log(db).insert_one({
        "run_id": run_id,
        "invoice_id": None,
        "to": "",
        "subject": f"Invoice {erp_result['bill_number']} posted to Zoho Books",
        "body": f"Bill {erp_result['bill_number']} posted. Zoho reference: {erp_result['zoho_reference']}.",
        "status": "sent",
        "sent_at": now,
        "created_at": now,
    })

    await approve_stage(
        db, run_id,
        slug="bill_posting",
        current_user=_STP_ACTOR,
        action="bill_posting.stp_submitted",
        payload={"zoho_reference": erp_result["zoho_reference"]},
    )

    # Send confirmation email whenever a notification address is present —
    # the email sender for email-ingested invoices, or the optional `email`
    # form param for manual uploads.
    run_fresh = await pipeline_runs(db).find_one({"_id": run_id}) or {}
    sender_email = (run_fresh.get("source_meta") or {}).get("sender", "")
    if sender_email:
        try:
            from ...services import gmail_client
            from ...services.email_templates import bill_posted_html
            posted_date = now.strftime("%d %b %Y")
            total_fmt = f"{erp_result['total']:,.2f}" if erp_result.get("total") else "—"
            html = bill_posted_html(
                invoice_number=erp_result.get("bill_number", ""),
                vendor_name=vendor_name,
                currency=erp_result.get("currency", ""),
                total_amount=total_fmt,
                posted_date=posted_date,
                zoho_reference=erp_result["zoho_reference"],
                zoho_url=erp_result.get("zoho_url", ""),
            )
            await gmail_client.send_html_email(
                to=sender_email,
                subject=f"Invoice {erp_result['bill_number']} Posted Successfully",
                html_body=html,
            )
        except Exception:
            logger.exception("STP bill-posted notification email failed")

    return erp_result


# ── Public entry point (called as background task after upload) ────────────────

# Runs currently being processed by a cascade — prevents a resume trigger
# (human approval) racing an already-running cascade for the same invoice.
_ACTIVE_STP_RUNS: set[str] = set()


async def run_stp_for_pipeline(run_id: ObjectId) -> None:
    """
    Full STP cascade for one pipeline run.
    Safe to call as asyncio.create_task() — all errors are caught and logged.
    Re-entrant by design: called at upload AND as a *resume* whenever a human
    approves a stage while Auto-Process is on (already-approved stages are
    skipped by the cascade).
    """
    key = str(run_id)
    if key in _ACTIVE_STP_RUNS:
        logger.info("STP: cascade already running for %s — skipping duplicate trigger", key)
        return
    _ACTIVE_STP_RUNS.add(key)

    db = get_db()

    async def _set_stp_state(state: str) -> None:
        """Publish the cascade state on the run so the dashboard can tell
        'actively processing' (Review disabled) from 'waiting for a human'
        (Review enabled) without client-side guessing."""
        await pipeline_runs(db).update_one(
            {"_id": run_id},
            {"$set": {"stp_state": state, "updated_at": datetime.now(timezone.utc)}},
        )

    # Assume human review will be needed; overwritten with "done" on success.
    final_state = "waiting_review"
    try:
        await _set_stp_state("processing")
        # Brief pause so the upload handler's DB writes are fully committed
        await asyncio.sleep(0.5)

        # 1. Auto-approve all (remaining) validation stages
        result = await _cascade_validation(db, run_id)
        logger.info("STP cascade for run %s: approved=%s", run_id, result["stages_approved"])

        # 2. Auto-post bill to Zoho (only when all validation stages passed)
        if result["reason"] == "ready_for_bill_posting":
            # approve_stage(line_item_matching) already triggered bill_posting → in_review
            # poll briefly as a safety net for any propagation lag
            for _ in range(15):
                bp = await executed_stages(db).find_one({"run_id": run_id, "stage_slug": "bill_posting"})
                if bp and bp.get("status") in ("in_review", "approved", "completed"):
                    break
                await asyncio.sleep(0.3)
            else:
                logger.error("STP: bill_posting never reached in_review for run %s", run_id)
                return

            if bp.get("status") in ("approved", "completed"):
                logger.info("STP: bill already posted for run %s — nothing to do", run_id)
                final_state = "done"
                return

            await asyncio.sleep(3)
            await _auto_post_bill(db, run_id)
            logger.info("STP bill posted for run %s", run_id)
            final_state = "done"
        else:
            logger.warning(
                "STP: cascade incomplete for run %s — approved=%s, waiting for human review",
                run_id, result["stages_approved"],
            )

    except Exception:
        logger.exception("STP pipeline run failed for run_id=%s", run_id)
    finally:
        _ACTIVE_STP_RUNS.discard(key)
        try:
            await _set_stp_state(final_state)
        except Exception:
            logger.exception("STP: failed to publish final state for run %s", run_id)


# ── Global ACK_THRESHOLD (persisted in app_settings) ─────────────────────────

DEFAULT_ACK_THRESHOLD = 3


async def get_global_ack_threshold(db) -> int:
    doc = await app_settings(db).find_one({"key": "ack_threshold"})
    if doc and doc.get("value") is not None:
        return int(doc["value"])
    return DEFAULT_ACK_THRESHOLD


async def set_global_ack_threshold(db, value: int) -> None:
    await app_settings(db).update_one(
        {"key": "ack_threshold"},
        {"$set": {"value": value, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


# ── REST endpoints ─────────────────────────────────────────────────────────────



@router.get("/settings/stp")
async def get_stp_setting(current_user: CurrentUser):
    db = get_db()
    enabled = await get_global_stp(db)
    return _envelope(data={"stp_enabled": enabled})


class StpRequest(BaseModel):
    enabled: bool


@router.patch("/settings/stp")
async def update_stp_setting(body: StpRequest, current_user: CurrentUser):
    if current_user.role not in ("tenant_admin", "workspace_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    db = get_db()
    await set_global_stp(db, body.enabled)
    return _envelope(data={"stp_enabled": body.enabled})


@router.get("/settings/ack-threshold")
async def get_ack_threshold_setting(current_user: CurrentUser):
    db = get_db()
    value = await get_global_ack_threshold(db)
    return _envelope(data={"ack_threshold": value})


class AckThresholdRequest(BaseModel):
    value: int


@router.patch("/settings/ack-threshold")
async def update_ack_threshold_setting(body: AckThresholdRequest, current_user: CurrentUser):
    if current_user.role not in ("tenant_admin", "workspace_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if body.value < 1:
        raise HTTPException(status_code=422, detail="ACK threshold must be at least 1")
    db = get_db()
    await set_global_ack_threshold(db, body.value)
    return _envelope(data={"ack_threshold": body.value})

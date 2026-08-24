"""
DirectPay Auto-Process (STP) — a DirectPay-scoped toggle, independent of
P2P's `api/v1/stp.py` (own setting, own learned-ack memory, own gate logic)
per the deliberate isolation decision for this module. Covers BOTH entities,
with deliberately different shapes:

    invoices   a gated cascade — extraction through to the ERP post, stopping
               at the first stage that genuinely needs a human
               (_cascade_dp_invoice)
    contracts  an ungated cascade — Review through Derived Fields to Saved.
               A contract has nothing to validate against (no PO, no Faktur
               Pajak, no mandatory-field gate), so there is nothing that could
               hold it and it always ends up saved (_cascade_dp_contract)

Scope: a full straight-through cascade, mirroring what P2P's own STP actually
does. Extraction, Confirm Extraction, Faktur Pajak, contract match, Matching
approval and the ERP post are each driven automatically, stopping at the first
stage that genuinely needs a human and publishing WHY on the run.

    CORRECTION. An earlier version of this module ran extraction and stopped,
    on the stated grounds that "P2P's STP does NOT auto-drive an uploaded
    invoice all the way through matching/bill-posting either". That claim was
    wrong: api/v1/stp.py's _cascade_validation() auto-approves every stage in
    STAGE_SEQUENCE and _auto_post_bill() then posts the bill to Zoho/QBD. The
    toggle therefore appeared functional while having no effect on the pipeline
    past the step the Extraction screen would have run on its own.

Each hand-off point reuses the stage's OWN approve function, so Auto-Process can
never be more permissive than a human clicking the same button — the gate that
would 409 a human raises here too and the cascade holds:

    faktur_pajak_mismatch   a required FP field mismatches and isn't acknowledged
    no_contract_matched     no saved contract scored high enough to auto-apply
    matching_open_issues    a mandatory Matching field is unresolved (has_open_issues)
    tax_code_invalid        VAT/WHT codes don't apply to this vendor
    extraction_failed       the cascade itself raised

Re-entrant, like P2P's: the router re-triggers it whenever a human approves one
of those stages with Auto-Process on, and every step is guarded by the run's own
status so already-completed stages are skipped. That is what turns a hold into a
resume rather than a dead end.
"""
import asyncio
import logging
from datetime import datetime, timezone

from bson import ObjectId

from ..db.collections import app_settings
from . import service
from .store import dp_invoice_runs

logger = logging.getLogger(__name__)

DEFAULT_DP_ACK_THRESHOLD = 3

_ACTIVE_DP_STP_RUNS: set[str] = set()


def _now():
    return datetime.now(timezone.utc)


# ── Global settings (app_settings is generic shared infrastructure — not a
# P2P concept — DirectPay just uses its own key strings within it) ──────────

async def get_global_dp_stp(db) -> bool:
    doc = await app_settings(db).find_one({"key": "directpay_stp"})
    return bool(doc.get("value", False)) if doc else False


async def set_global_dp_stp(db, enabled: bool) -> None:
    await app_settings(db).update_one(
        {"key": "directpay_stp"},
        {"$set": {"value": enabled, "updated_at": _now()}},
        upsert=True,
    )


async def get_dp_ack_threshold(db) -> int:
    doc = await app_settings(db).find_one({"key": "directpay_ack_threshold"})
    if doc and doc.get("value") is not None:
        return int(doc["value"])
    return DEFAULT_DP_ACK_THRESHOLD


async def set_dp_ack_threshold(db, value: int) -> None:
    await app_settings(db).update_one(
        {"key": "directpay_ack_threshold"},
        {"$set": {"value": value, "updated_at": _now()}},
        upsert=True,
    )


# Matching-stage, per-field tolerance check — on by default per explicit
# instruction (see _apply_mandatory_field_coverage's own reads of this).
# Stored as a single {enabled, threshold_pct} value, not two separate keys
# the way STP/Ack Threshold above are — the two sub-fields are only ever
# meaningful together.
DEFAULT_DP_TOTAL_BEFORE_VAT_THRESHOLD_ENABLED = True
DEFAULT_DP_TOTAL_BEFORE_VAT_THRESHOLD_PCT = 5.0


async def get_dp_total_before_vat_threshold(db) -> dict:
    doc = await app_settings(db).find_one({"key": "directpay_total_before_vat_threshold"})
    value = (doc or {}).get("value") or {}
    return {
        "enabled": bool(value.get("enabled", DEFAULT_DP_TOTAL_BEFORE_VAT_THRESHOLD_ENABLED)),
        "threshold_pct": float(value.get("threshold_pct", DEFAULT_DP_TOTAL_BEFORE_VAT_THRESHOLD_PCT)),
    }


async def set_dp_total_before_vat_threshold(db, enabled: bool, threshold_pct: float) -> None:
    await app_settings(db).update_one(
        {"key": "directpay_total_before_vat_threshold"},
        {"$set": {"value": {"enabled": enabled, "threshold_pct": threshold_pct}, "updated_at": _now()}},
        upsert=True,
    )


# ── Cascade ────────────────────────────────────────────────────────────────────

async def _set_stp_state(db, run_id: ObjectId, state: str, reason: str | None = None) -> None:
    await dp_invoice_runs(db).update_one(
        {"_id": run_id},
        {"$set": {"stp_state": state, "stp_failure_reason": reason, "updated_at": _now()}},
    )


# Demo pacing, same intent and rough magnitudes as api/v1/stp.py's own: a
# visible "extraction is running" window, then a beat between stages so the
# dashboard shows the cascade moving rather than teleporting.
_EXTRACTION_PAUSE_S = 5.0
_STAGE_PAUSE_S = 2.0

# Contract extraction is paced by the DOCUMENT'S SIZE rather than a flat wait: a
# 3-page letter of agreement plainly shouldn't take as long to "extract" as a
# 37-page lease, and a per-contract delay makes a batch upload look like real
# work being done at different speeds rather than a row of identical timers.
#
# delay = min(CONTRACT_EXTRACTION_MAX_S, FLOOR + pages x PER_PAGE)
#
# Across the seven fixtures (3, 4, 11, 13, 19, 34 and 37 pages) this spreads
# them over ~1.9s .. 6.0s, every vendor visibly distinct, with only the largest
# hitting the cap:
#
#   KARYA_NASTARI  3p -> 1.9s     DEBORA_KEMANG 19p -> 4.0s
#   GRAHA_MEGARIA  4p -> 2.0s     PT_BANGUN     34p -> 5.9s
#   PAKUWON       11p -> 2.9s     RATNA_INTAN   37p -> 6.0s (capped)
#   PALLADIUM     13p -> 3.2s
_CONTRACT_EXTRACTION_FLOOR_S = 1.5
_CONTRACT_EXTRACTION_PER_PAGE_S = 0.13
_CONTRACT_EXTRACTION_MAX_S = 6.0


def contract_extraction_pause_s(pages: int) -> float:
    """Extraction dwell for a contract of `pages` pages, capped at 6s."""
    return min(
        _CONTRACT_EXTRACTION_MAX_S,
        _CONTRACT_EXTRACTION_FLOOR_S + max(1, pages) * _CONTRACT_EXTRACTION_PER_PAGE_S,
    )

# Recorded as the editor on any change the cascade makes, so the edit history
# distinguishes automation from a person.
_STP_ACTOR_EMAIL = "stp@neoflo.ai"


async def _cascade_dp_invoice(db, run_id: ObjectId) -> tuple[str, str | None]:
    """Drive one invoice as far as it can honestly go. Returns (state, reason).

    Every step is gated on the run's CURRENT status, so this is safe to re-enter
    as a resume after a human clears a hold: completed stages are simply skipped.
    """
    async def status() -> str:
        return (await service.get_invoice_doc(db, run_id)).get("status") or ""

    # 1. Extraction ─────────────────────────────────────────────────────────
    if await status() == "extraction":
        await service.extract_invoice(db, run_id)
        logger.info("DirectPay STP: extracted run %s", run_id)
        await asyncio.sleep(_EXTRACTION_PAUSE_S)

    # 2. Confirm Extraction — auto-advances to fp_extraction when this vendor
    #    has a real Faktur Pajak, else stays "extracted" ready for Matching.
    doc = await service.get_invoice_doc(db, run_id)
    if doc.get("status") == "extracted" and not doc.get("extraction_confirmed"):
        await service.confirm_extraction(db, run_id, None, _STP_ACTOR_EMAIL)
        logger.info("DirectPay STP: confirmed extraction for run %s", run_id)
        await asyncio.sleep(_STAGE_PAUSE_S)

    # 3. Faktur Pajak ───────────────────────────────────────────────────────
    if await status() == "fp_extraction":
        try:
            # No force: an unacknowledged mismatch on a required field must stop
            # automation exactly as it stops a human.
            await service.approve_faktur_pajak(db, run_id)
        except service.NeedsConfirmationError:
            logger.info("DirectPay STP: run %s holding at Faktur Pajak — unacknowledged mismatch", run_id)
            return "waiting_review", "faktur_pajak_mismatch"
        logger.info("DirectPay STP: approved Faktur Pajak for run %s", run_id)
        await asyncio.sleep(_STAGE_PAUSE_S)

    # 4. Contract match — the same lazy auto-apply the Matching screen performs
    #    on load; it only applies a confident candidate.
    doc = await service.get_invoice_doc(db, run_id)
    if doc.get("status") == "extracted" and not doc.get("contract_id"):
        await service.get_contract_recommendation(db, run_id)
        doc = await service.get_invoice_doc(db, run_id)
        if not doc.get("contract_id"):
            logger.info("DirectPay STP: run %s holding — no contract could be matched", run_id)
            return "waiting_review", "no_contract_matched"
        logger.info("DirectPay STP: matched run %s to contract %s", run_id, doc["contract_id"])
        await asyncio.sleep(_STAGE_PAUSE_S)

    # 5. Matching approval ──────────────────────────────────────────────────
    if await status() == "matching":
        try:
            # review_action deliberately has NO force (Matching's mandatory
            # checklist can only be fixed or acknowledged), so this raises
            # whenever has_open_issues() would have blocked a human.
            await service.review_action(db, run_id, "approve", None)
        except service.NeedsConfirmationError:
            logger.info("DirectPay STP: run %s holding at Matching — open mandatory issues", run_id)
            return "waiting_review", "matching_open_issues"
        logger.info("DirectPay STP: approved Matching for run %s", run_id)
        await asyncio.sleep(_STAGE_PAUSE_S)

    # 6. Post to ERP ────────────────────────────────────────────────────────
    if await status() == "bill_posting":
        try:
            await service.post_bill(db, run_id)
        except service.InvalidStateError as exc:
            logger.info("DirectPay STP: run %s holding at Bill Posting — %s", run_id, exc)
            return "waiting_review", "tax_code_invalid"
        logger.info("DirectPay STP: posted bill for run %s", run_id)

    return ("done", None) if await status() == "posted" else ("waiting_review", "incomplete")


async def _set_contract_stp_state(db, run_id: ObjectId, state: str, reason: str | None = None) -> None:
    from .store import dp_contract_runs
    await dp_contract_runs(db).update_one(
        {"_id": run_id},
        {"$set": {"stp_state": state, "stp_failure_reason": reason, "updated_at": _now()}},
    )


async def _contract_extraction_pause(db, run_id: ObjectId) -> float:
    """This contract's own extraction dwell, from its PDF's page count.

    Falls back to the flat pause if the run's fixture or its contract PDF can't
    be resolved — pacing must never be the thing that breaks a cascade.
    """
    try:
        from .fixtures import get_dp_loader
        doc = await service.get_contract_doc(db, run_id)
        loader = get_dp_loader()
        bundle = loader.discover().get(doc.get("fixture_key"))
        pages = loader.page_count(bundle.contract_pdf_path if bundle else None)
        pause = contract_extraction_pause_s(pages)
        logger.info(
            "DirectPay STP: contract %s is %d page(s) — extraction pause %.2fs",
            run_id, pages, pause,
        )
        return pause
    except Exception:
        logger.exception("DirectPay STP: could not size the extraction pause for %s", run_id)
        return _EXTRACTION_PAUSE_S


async def _cascade_dp_contract(db, run_id: ObjectId) -> tuple[str, str | None]:
    """Drive one contract from Review through to Saved.

    Unlike the invoice cascade there is NO gate here — no validation, no
    mismatch, no mandatory-field check. A contract has nothing to compare
    against, so there is nothing that could hold it: Auto-Process simply
    performs the same two approvals a person would click, in order, and the
    contract ends up saved.

        review          -> approve_contract                     -> postprocessing
        postprocessing  -> approve_contract_extraction_postproc -> saved

    Extraction Postprocessing (Derived Fields) only exists for a vendor with a
    real payment_schedule.json; approve_contract sends everyone else straight to
    "saved", so the second step is skipped by its own status guard rather than by
    testing the fixture again.

    Re-entrant on the run's current status, so it's safe to call on a contract
    that a human already moved part-way.
    """
    async def status() -> str:
        return (await service.get_contract_doc(db, run_id)).get("status") or ""

    # 1. Contract Review ────────────────────────────────────────────────────
    if await status() == "review":
        await service.approve_contract(db, run_id, None, _STP_ACTOR_EMAIL)
        logger.info("DirectPay STP: approved Contract Review for %s", run_id)
        await asyncio.sleep(_STAGE_PAUSE_S)

    # 2. Extraction Postprocessing / Derived Fields ─────────────────────────
    # The pause goes BEFORE this approval, not after it. Same total elapsed time
    # either way — the visible "still working" delay the demo needs is preserved —
    # but spending it here means the run visibly DWELLS on Derived Fields instead
    # of sitting for two seconds already saved while its final state waits to be
    # published, which showed the row as "Saved" and "Processing" at once.
    if await status() == "postprocessing":
        await asyncio.sleep(_STAGE_PAUSE_S)
        await service.approve_contract_extraction_postprocessing(db, run_id)
        logger.info("DirectPay STP: approved Derived Fields for %s", run_id)

    final = await status()
    return ("done", None) if final == "saved" else ("waiting_review", f"stopped at {final}")


async def run_dp_stp_for_contract(run_id: ObjectId) -> None:
    """Full Auto-Process cascade for one contract. Safe as an asyncio task —
    every error is caught and the outcome is always published on the run."""
    from ..database import get_db

    key = f"contract:{run_id}"
    if key in _ACTIVE_DP_STP_RUNS:
        logger.info("DirectPay STP: cascade already running for %s — skipping duplicate trigger", key)
        return
    _ACTIVE_DP_STP_RUNS.add(key)

    db = get_db()
    final_state, final_reason = "waiting_review", "cascade_failed"
    try:
        await _set_contract_stp_state(db, run_id, "processing")
        # Contracts have no extract step of their own — base_fields are already
        # populated at upload — so this stands in for the extraction window the
        # manual path shows before handing off to Review. Its length is this
        # contract's own, scaled by page count (see contract_extraction_pause_s).
        await asyncio.sleep(await _contract_extraction_pause(db, run_id))
        final_state, final_reason = await _cascade_dp_contract(db, run_id)
    except Exception:
        logger.exception("DirectPay STP: contract cascade failed for run_id=%s", run_id)
    finally:
        _ACTIVE_DP_STP_RUNS.discard(key)
        try:
            await _set_contract_stp_state(db, run_id, final_state, final_reason)
        except Exception:
            logger.exception("DirectPay STP: failed to publish final state for contract %s", run_id)


async def run_dp_stp_for_invoice(run_id: ObjectId) -> None:
    """Full Auto-Process cascade for one invoice. Safe as an asyncio task — every
    error is caught, and the outcome is always published on the run so the
    dashboard can tell "actively processing" from "waiting for a human"."""
    from ..database import get_db

    key = str(run_id)
    if key in _ACTIVE_DP_STP_RUNS:
        logger.info("DirectPay STP: cascade already running for %s — skipping duplicate trigger", key)
        return
    _ACTIVE_DP_STP_RUNS.add(key)

    db = get_db()
    final_state = "waiting_review"
    final_reason: str | None = "extraction_failed"

    try:
        await _set_stp_state(db, run_id, "processing")
        await asyncio.sleep(0.5)  # let the upload's own writes settle
        final_state, final_reason = await _cascade_dp_invoice(db, run_id)
    except Exception:
        logger.exception("DirectPay STP: cascade failed for run_id=%s", run_id)
    finally:
        _ACTIVE_DP_STP_RUNS.discard(key)
        try:
            await _set_stp_state(db, run_id, final_state, final_reason)
        except Exception:
            logger.exception("DirectPay STP: failed to publish final state for run %s", run_id)
        # The ONE place a hold is known, so the "action required" email hooks
        # here rather than at each of _cascade_dp_invoice's four return points.
        # Only an Auto-Process hold notifies: a human rejection and an invoice
        # simply left sitting at Matching deliberately send nothing. Sending is
        # itself conditional on the invoice carrying a trigger-upload payload
        # email — see service._dp_notification_email — and is idempotent per
        # (kind, stage), which matters because this function re-runs on every
        # resume_dp_stp_if_enabled.
        if final_state == "waiting_review" and final_reason:
            try:
                await service.notify_dp_auto_process_hold(db, run_id, final_reason)
            except Exception:
                logger.exception("DirectPay STP: hold notification failed for run %s", run_id)


async def resume_dp_stp_if_enabled(db, run_id: ObjectId) -> None:
    """Re-drive the cascade after a human clears whatever it was holding on.

    Mirrors P2P's own resume hook (api/v1/stages.py, on a human approving
    fp_extraction / metadata_validation / line_item_matching). Without this a
    hold is a dead end: Auto-Process stops for a mismatch, the reviewer
    acknowledges it, and nothing ever picks the invoice back up.

    Called from the router's human-facing approve handlers only, never from the
    cascade itself, so it cannot recurse.
    """
    if not await get_global_dp_stp(db):
        return
    logger.info("DirectPay STP: resume triggered by human approval for run %s", run_id)
    asyncio.create_task(run_dp_stp_for_invoice(run_id))

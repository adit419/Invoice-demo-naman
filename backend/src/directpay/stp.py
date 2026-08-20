"""
DirectPay Auto-Process (STP) — a DirectPay-scoped toggle, independent of
P2P's `api/v1/stp.py` (own setting, own learned-ack memory, own gate logic)
per the deliberate isolation decision for this module. Applies to invoices
only — contracts have no validation/mismatch concept and always require a
manual "Approve" click, Auto-Process or not.

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

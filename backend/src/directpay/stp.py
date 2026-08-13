"""
DirectPay Auto-Process (STP) — a DirectPay-scoped toggle and cascade,
independent of P2P's `api/v1/stp.py` (own setting, own learned-ack memory,
own gate logic) per the deliberate isolation decision for this module.
Applies to invoices only — contracts have no validation/mismatch concept and
always require a manual "Approve" click, Auto-Process or not.

Cascade: extraction -> required-fields check -> AI contract recommendation
-> (hold if AI is uncertain, or if the resulting match has open issues) ->
approve -> post bill. A confident AI pick with a clean comparison completes
fully unattended all the way to "posted"; anything uncertain or unresolved
holds at "waiting_review" for a human to finish via the normal Matching-page
flow — mirroring how P2P's STP calls the same internal functions a human's
click would (including auto-posting the bill after a clean approval), and
never fabricates a bespoke "auto-only" business rule.
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


# ── Cascade ────────────────────────────────────────────────────────────────────

async def _set_stp_state(db, run_id: ObjectId, state: str, reason: str | None = None) -> None:
    await dp_invoice_runs(db).update_one(
        {"_id": run_id},
        {"$set": {"stp_state": state, "stp_failure_reason": reason, "updated_at": _now()}},
    )


async def run_dp_stp_for_invoice(run_id: ObjectId) -> None:
    from ..database import get_db

    key = str(run_id)
    if key in _ACTIVE_DP_STP_RUNS:
        logger.info("DirectPay STP: cascade already running for %s — skipping duplicate trigger", key)
        return
    _ACTIVE_DP_STP_RUNS.add(key)

    db = get_db()
    final_state = "waiting_review"
    final_reason: str | None = None

    try:
        await _set_stp_state(db, run_id, "processing")
        await asyncio.sleep(0.5)  # demo "processing latency", matches P2P's stp.py pacing

        doc = await service.get_invoice_doc(db, run_id)
        if doc.get("status") == "extraction":
            await service.extract_invoice(db, run_id)
            doc = await service.get_invoice_doc(db, run_id)

        extracted = service._merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
        missing = service.missing_required_fields(extracted)
        if missing:
            final_reason = "mandatory_fields_missing"
            return

        if not doc.get("contract_id"):
            rec = await service.get_contract_recommendation(db, run_id)
            if rec.get("status") == "no_match":
                final_reason = "no_contract_available"
                return
            # rec.status == "applied" — a confident AI pick was just made and
            # match_invoice() already ran inside get_contract_recommendation.
            # Deliberately NOT held here: an uncertain AI pick already
            # returned above; a confident one proceeds straight to the same
            # issue-check every match goes through, exactly like a human's
            # own contract selection would.
            await asyncio.sleep(0.5)

        doc = await service.get_invoice_doc(db, run_id)
        try:
            await service.review_action(db, run_id, action="approve", force=False, reason=None)
        except service.NeedsConfirmationError:
            final_reason = "open_issues_pending_review"
            return

        await asyncio.sleep(0.5)  # demo "processing latency" before the ERP post
        await service.post_bill(db, run_id)

        final_state = "done"
        final_reason = None

    except Exception:
        logger.exception("DirectPay STP: cascade failed for run_id=%s", run_id)
    finally:
        _ACTIVE_DP_STP_RUNS.discard(key)
        try:
            await _set_stp_state(db, run_id, final_state, final_reason)
        except Exception:
            logger.exception("DirectPay STP: failed to publish final state for run %s", run_id)

"""
DirectPay Auto-Process (STP) — a DirectPay-scoped toggle, independent of
P2P's `api/v1/stp.py` (own setting, own learned-ack memory, own gate logic)
per the deliberate isolation decision for this module. Applies to invoices
only — contracts have no validation/mismatch concept and always require a
manual "Approve" click, Auto-Process or not.

Scope (matches P2P's own real behavior, verified directly against its
dashboard.tsx/stp.py — P2P's STP does NOT auto-drive an uploaded invoice all
the way through matching/bill-posting either; the only place STP affects
navigation in P2P is the *reverse* direction, bouncing a human's manual
Extraction-approve back to the dashboard so automation keeps driving from
there): on upload, Auto-Process runs ONLY the extraction step, then hands the
invoice to the human on the Extraction screen — it skips the manual "click
Review, wait for extract" step, nothing more. Matching, approval, and bill
posting are never auto-driven by this cascade; from the Extraction screen
onward an Auto-Process invoice follows the exact same manual flow as one
uploaded with Auto-Process off.
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


async def run_dp_stp_for_invoice(run_id: ObjectId) -> None:
    """Auto-Process's entire job: run extraction, then stop. The frontend
    polls for this to land the human on the Extraction screen the moment it's
    done — everything past that point (confirm, matching, approval, posting)
    is the same manual flow as when Auto-Process is off."""
    from ..database import get_db

    key = str(run_id)
    if key in _ACTIVE_DP_STP_RUNS:
        logger.info("DirectPay STP: extraction already running for %s — skipping duplicate trigger", key)
        return
    _ACTIVE_DP_STP_RUNS.add(key)

    db = get_db()
    final_state = "waiting_review"
    final_reason: str | None = "extraction_failed"

    try:
        await _set_stp_state(db, run_id, "processing")
        await asyncio.sleep(0.5)  # demo "processing latency", matches P2P's stp.py pacing

        doc = await service.get_invoice_doc(db, run_id)
        if doc.get("status") == "extraction":
            await service.extract_invoice(db, run_id)

        final_state = "done"
        final_reason = None

    except Exception:
        logger.exception("DirectPay STP: extraction failed for run_id=%s", run_id)
    finally:
        _ACTIVE_DP_STP_RUNS.discard(key)
        try:
            await _set_stp_state(db, run_id, final_state, final_reason)
        except Exception:
            logger.exception("DirectPay STP: failed to publish final state for run %s", run_id)

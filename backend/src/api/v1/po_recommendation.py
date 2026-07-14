"""
AI PO recommendation endpoints — extraction-stage aid for invoices whose
extracted po_number is missing.

The recommendation is computed lazily on first GET (i.e. once extraction data
exists and is under review) and cached in the `po_recommendations` collection.
When a candidate clears the score threshold it is applied immediately: the
recommended po_number is written through the same edit_history mechanism as a
manual extraction edit (attributed to "Neo AI"), so the audit trail, fixture
replay, and approval validation all behave exactly as if a user had typed the
value. The user overrides it by editing the field through the existing inline
edit flow — there is no separate accept/reject step.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import invoices, pipeline_runs, po_recommendations
from ...services.invoice_state import get_invoice_state
from ...services.po_recommendation import build_recommendation
from ._common import _envelope, _extract_field, _oid

router = APIRouter(tags=["po_recommendation"])

# Edit-history attribution for the auto-filled value — shows up as "Neo AI"
# in the extraction edit-history feed.
_AI_ACTOR = {"user_id": "neo-ai", "user_email": "Neo AI"}


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def _public(doc: dict) -> dict:
    return {
        "status": doc.get("status"),
        "recommended": doc.get("recommended"),
        "candidates": doc.get("candidates", []),
        "candidates_considered": doc.get("candidates_considered", 0),
        "invoice_fields": doc.get("invoice_fields", {}),
        "generated_at": _iso(doc.get("generated_at")),
        "applied_at": _iso(doc.get("applied_at")),
    }


async def _apply_po_edit(db, oid, old_value, new_value) -> None:
    """Record the AI-filled PO exactly like a manual extraction edit."""
    now = datetime.now(timezone.utc)
    await invoices(db).update_one(
        {"run_id": oid},
        {
            "$push": {"edit_history": {
                "timestamp": now,
                "user_id": _AI_ACTOR["user_id"],
                "user_email": _AI_ACTOR["user_email"],
                "scope": "metadata",
                "field": "po_number",
                "row_id": None,
                "old_value": None if old_value is None else str(old_value),
                "new_value": None if new_value is None else str(new_value),
            }},
            "$set": {"updated_at": now},
        },
    )


# ── GET /invoices/{id}/stages/extraction/po-recommendation ────────────────────

@router.get("/invoices/{invoice_id}/stages/extraction/po-recommendation")
async def get_po_recommendation(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    state = await get_invoice_state(db, oid)
    current_po = _extract_field(state["invoice_schema"], "po_number")

    existing = await po_recommendations(db).find_one({"run_id": oid})
    if existing:
        return _envelope(data={
            "applicable": True,
            "current_po_number": current_po,
            **_public(existing),
        })

    # Existing flow untouched: a present PO number means no recommendation is
    # ever generated for this invoice.
    if current_po:
        return _envelope(data={
            "applicable": False,
            "reason": "po_number_present",
            "current_po_number": current_po,
        })

    result = await build_recommendation(state["invoice_schema"])
    now = datetime.now(timezone.utc)
    applied = result["recommended"] is not None
    if applied:
        await _apply_po_edit(db, oid, current_po, result["recommended"]["po_number"])
        current_po = result["recommended"]["po_number"]

    doc = {
        "run_id": oid,
        "status": "applied" if applied else "no_match",
        "recommended": result["recommended"],
        "candidates": result["candidates"],
        "candidates_considered": result["candidates_considered"],
        "invoice_fields": result["invoice_fields"],
        "generated_at": now,
        "applied_at": now if applied else None,
    }
    await po_recommendations(db).update_one(
        {"run_id": oid}, {"$set": doc}, upsert=True
    )

    return _envelope(data={
        "applicable": True,
        "current_po_number": current_po,
        **_public(doc),
    })

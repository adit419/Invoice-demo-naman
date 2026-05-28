from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import executed_stages, invoices, pipeline_runs
from ...services.invoice_state import (
    coerce_line_item_value,
    get_invoice_state,
)
from .stages import approve_stage, reject_stage

router = APIRouter(tags=["extraction"])


from ._common import _envelope, _oid, _require_editor


# ── GET /api/v1/invoices/{id}/stages/extraction ───────────────────────────────

@router.get("/invoices/{invoice_id}/stages/extraction")
async def get_extraction(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Fresh state: fixture extraction.json + replayed edit_history
    state = await get_invoice_state(db, oid)
    inv = await invoices(db).find_one({"run_id": oid}) or {}
    stage_doc = await executed_stages(db).find_one({"run_id": oid, "stage_slug": "extraction"}) or {}

    return _envelope(data={
        "invoice_schema": state["invoice_schema"],
        "bbox_schema": state["bbox_schema"],
        "status": run.get("status", "in_progress"),
        "stage_status": stage_doc.get("status", "in_review"),
        "fixture_key": run.get("fixture_key", ""),
        "file_name": run.get("file_name", ""),
        "vendor_name": inv.get("vendor_name"),
        "invoice_number": inv.get("invoice_number"),
        "total_amount": inv.get("total_amount"),
        "currency": inv.get("currency"),
    })


# ── POST .../approve ──────────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/stages/extraction/approve")
async def approve_extraction(invoice_id: str, current_user: CurrentUser):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    result = await approve_stage(
        db, oid,
        slug="extraction",
        current_user=current_user,
        action="extraction.approved",
    )

    next_stage = result["next_stage"]
    # vendor_validation is skipped → next stage after extraction is
    # metadata_validation, but on the FE it lives inside the unified
    # /matching page (Metadata tab). Land the user there directly.
    redirect = f"/invoice/{invoice_id}/matching?tab=metadata" if next_stage else f"/invoice/{invoice_id}"
    return _envelope(data={"next_stage": next_stage, "redirect": redirect})


# ── POST .../reject ───────────────────────────────────────────────────────────

class RejectRequest(BaseModel):
    reason: str


@router.post("/invoices/{invoice_id}/stages/extraction/reject")
async def reject_extraction(invoice_id: str, body: RejectRequest, current_user: CurrentUser):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    await reject_stage(db, oid, "extraction", current_user, body.reason)

    return _envelope(data={"status": "rejected"})


# ── PATCH .../edit ────────────────────────────────────────────────────────────

class MetadataEdit(BaseModel):
    field: str
    value: str


class LineItemEdit(BaseModel):
    row_id: str
    field: str
    value: str


class EditRequest(BaseModel):
    metadata_edits: list[MetadataEdit] = []
    line_item_edits: list[LineItemEdit] = []


@router.patch("/invoices/{invoice_id}/stages/extraction/edit")
async def edit_extraction(invoice_id: str, body: EditRequest, current_user: CurrentUser):
    """
    Append user edits to `invoices.edit_history`. We never overwrite the
    fixture-derived `invoice_schema` — GET replays history on top of the fixture
    every time. `old_value` is computed from the currently-replayed state so
    history entries stay accurate even if the fixture changes underneath us.
    """
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    inv = await invoices(db).find_one({"run_id": oid}, {"_id": 1})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Resolve current values via the same replay path the UI sees.
    state = await get_invoice_state(db, oid)
    invoice_schema = state["invoice_schema"]
    current_meta = {m["field"]: m.get("value") for m in invoice_schema.get("metadata", []) if m.get("field")}
    current_line_items = {
        li["row_id"]: li
        for li in invoice_schema.get("line_items", [])
        if li.get("row_id")
    }

    now = datetime.now(timezone.utc)
    history_entries: list[dict] = []

    for me in body.metadata_edits:
        old_value = current_meta.get(me.field)
        new_value = me.value
        if str(old_value or "") == str(new_value or ""):
            continue
        history_entries.append({
            "timestamp": now,
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "scope": "metadata",
            "field": me.field,
            "row_id": None,
            "old_value": None if old_value is None else str(old_value),
            "new_value": None if new_value is None else str(new_value),
        })

    for li in body.line_item_edits:
        row = current_line_items.get(li.row_id)
        if row is None:
            # Edit targets a row that doesn't exist in fixture — drop silently.
            continue
        old_value = row.get(li.field)
        new_value = coerce_line_item_value(li.field, li.value)
        if str(old_value or "") == str(new_value or ""):
            continue
        history_entries.append({
            "timestamp": now,
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "scope": "line_item",
            "field": li.field,
            "row_id": li.row_id,
            "old_value": None if old_value is None else str(old_value),
            "new_value": None if new_value is None else str(new_value),
        })

    if not history_entries:
        return _envelope(data={"edited_fields": 0})

    await invoices(db).update_one(
        {"run_id": oid},
        {
            "$push": {"edit_history": {"$each": history_entries}},
            "$set": {"updated_at": now},
        },
    )

    return _envelope(data={"edited_fields": len(history_entries)})


# ── GET .../edits — edit history (audit trail) ────────────────────────────────

@router.get("/invoices/{invoice_id}/stages/extraction/edits")
async def list_extraction_edits(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    inv = await invoices(db).find_one({"run_id": oid}, {"edit_history": 1})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    history = inv.get("edit_history", []) or []
    # Newest first.
    history_sorted = sorted(history, key=lambda h: h.get("timestamp") or datetime.min, reverse=True)

    items = [
        {
            "timestamp": (h.get("timestamp").isoformat() if isinstance(h.get("timestamp"), datetime) else h.get("timestamp")),
            "user_email": h.get("user_email"),
            "scope": h.get("scope"),
            "field": h.get("field"),
            "row_id": h.get("row_id"),
            "old_value": h.get("old_value"),
            "new_value": h.get("new_value"),
        }
        for h in history_sorted
    ]

    return _envelope(data={"items": items, "total": len(items)})

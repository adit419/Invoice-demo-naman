from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import executed_stages, invoices, pipeline_runs
from ...services.fixtures import get_loader
from ...services.invoice_state import get_invoice_schema
from .stages import approve_stage, reject_stage

router = APIRouter(tags=["vendor_validation"])


from ._common import (
    _envelope,
    _extract_field,
    _oid,
    _require_editor,
    _unwrap_fixture,
)


# ── GET /api/v1/invoices/{id}/stages/vendor_validation ────────────────────────

@router.get("/invoices/{invoice_id}/stages/vendor_validation")
async def get_vendor_validation(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Live extraction state: fixture extraction.json + replayed edit_history
    invoice_schema = await get_invoice_schema(db, oid)

    # Load vendor validation fixture
    loader = get_loader()
    bundles = loader.discover()
    fixture_key = run.get("fixture_key", "")
    bundle = bundles.get(fixture_key)
    fixture = _unwrap_fixture(bundle.vendor_validation if bundle else {})

    stage_doc = await executed_stages(db).find_one({"run_id": oid, "stage_slug": "vendor_validation"}) or {}

    # Build map of current values from invoice metadata (may have been edited or back-populated)
    current_meta: dict[str, str] = {}
    for m in invoice_schema.get("metadata", []):
        val = m.get("value")
        if val:
            current_meta[m["field"]] = val

    # Merge current invoice values into fixture fields so back-populated values persist
    merged_fields = []
    for field in fixture.get("fields", []):
        fname = field.get("field_name", "")
        if fname in current_meta and field.get("values", {}).get("invoice"):
            inv_list = field["values"]["invoice"]
            new_inv_list = [{**inv_list[0], "value": current_meta[fname]}] + list(inv_list[1:])
            po_vals = field["values"].get("po", [])
            po_val = po_vals[0].get("value") if po_vals else None
            inv_val = current_meta[fname]
            new_match = "match" if (
                po_val is not None and str(inv_val).strip() == str(po_val).strip()
            ) else "mismatch"
            field = {
                **field,
                "values": {**field["values"], "invoice": new_inv_list},
                "match_status": new_match,
            }
        merged_fields.append(field)

    return _envelope(data={
        "invoice_number": _extract_field(invoice_schema, "invoice_number"),
        "invoice_date": _extract_field(invoice_schema, "invoice_date"),
        "vendor_name": _extract_field(invoice_schema, "vendor_name"),
        "po_number": _extract_field(invoice_schema, "po_number"),
        "file_name": run.get("file_name", ""),
        "fixture_key": fixture_key,
        "status": run.get("status", "in_progress"),
        "stage_status": stage_doc.get("status", "in_review"),
        "fields": merged_fields,
        "summary": fixture.get("summary", {}),
        "required_missing_fields": fixture.get("required_missing_fields", []),
    })


# ── POST .../approve ──────────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/stages/vendor_validation/approve")
async def approve_vendor_validation(
    invoice_id: str,
    current_user: CurrentUser,
):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    result = await approve_stage(
        db, oid,
        slug="vendor_validation",
        current_user=current_user,
        action="vendor_validation.approved",
    )

    next_stage = result["next_stage"]
    redirect = f"/invoice/{invoice_id}/metadata-validation" if next_stage else f"/invoice/{invoice_id}"
    return _envelope(data={"next_stage": next_stage, "redirect": redirect})


# ── POST .../reject ───────────────────────────────────────────────────────────

class RejectRequest(BaseModel):
    reason: str


@router.post("/invoices/{invoice_id}/stages/vendor_validation/reject")
async def reject_vendor_validation(
    invoice_id: str,
    body: RejectRequest,
    current_user: CurrentUser,
):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    await reject_stage(db, oid, "vendor_validation", current_user, body.reason)

    return _envelope(data={"status": "rejected"})

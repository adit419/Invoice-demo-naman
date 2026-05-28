"""Endpoint for the rejected terminal state page."""
from fastapi import APIRouter, HTTPException

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import executed_stages, invoices, pipeline_runs
from .stages import STAGE_SEQUENCE

router = APIRouter(tags=["rejected"])

STAGE_DISPLAY = {
    "ingestion": "Ingestion",
    "extraction": "Extraction",
    "vendor_validation": "Vendor Validation",
    "metadata_validation": "Metadata Validation",
    "line_item_matching": "Line Item Matching",
    "bill_posting": "Bill Posting",
    "posted": "ERP Posted",
}


from ._common import _envelope, _oid


@router.get("/invoices/{invoice_id}/rejected")
async def get_rejected(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Live extraction state: fixture extraction.json + replayed edit_history
    from ...services.invoice_state import get_invoice_schema
    invoice_schema = await get_invoice_schema(db, oid)

    def _meta(field: str):
        for m in invoice_schema.get("metadata", []):
            if m.get("field") == field:
                return m.get("value") or None
        return None

    # Read rejection info stored directly on the pipeline_run
    rejection_info = run.get("rejection") or {}
    stage_slug = rejection_info.get("stage", "")
    rejected_at = rejection_info.get("rejected_at")
    reason = rejection_info.get("reason", "No reason provided")
    actor_name = rejection_info.get("actor_name", "")
    actor_role = rejection_info.get("actor_role", "")

    # Executed stages timeline — sort by pipeline sequence order
    stages_cursor = executed_stages(db).find({"run_id": oid})
    stage_docs = await stages_cursor.to_list(length=50)
    stage_docs.sort(key=lambda s: STAGE_SEQUENCE.index(s["stage_slug"]) if s["stage_slug"] in STAGE_SEQUENCE else 99)
    timeline = []
    for s in stage_docs:
        slug = s.get("stage_slug", "")
        completed_at = s.get("completed_at")
        started_at = s.get("started_at")
        timeline.append({
            "slug": slug,
            "display_name": STAGE_DISPLAY.get(slug, slug),
            "status": s.get("status", ""),
            "started_at": started_at.isoformat() if started_at else None,
            "completed_at": completed_at.isoformat() if completed_at else None,
        })

    return _envelope(data={
        "invoice_number": _meta("invoice_number"),
        "invoice_date": _meta("invoice_date"),
        "vendor_name": _meta("vendor_name"),
        "file_name": run.get("file_name", ""),
        "status": "rejected" if run.get("status") == "failed" else run.get("status", "rejected"),
        "rejection": {
            "reason": reason,
            "stage": stage_slug,
            "stage_display": STAGE_DISPLAY.get(stage_slug, stage_slug),
            "actor_name": actor_name,
            "actor_role": actor_role,
            "rejected_at": rejected_at.isoformat() if rejected_at else None,
        },
        "timeline": timeline,
    })

"""
Pipeline navigation — returns a per-invoice list of all visible stages with
their current status so the FE can render a clickable stage strip.
"""
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import executed_stages, pipeline_runs
from .stages import STAGE_DISPLAY

router = APIRouter(tags=["pipeline_nav"])


from ._common import _envelope, _oid


# Only stages the user can navigate to (ingestion is internal,
# vendor_validation is skipped in the forward flow).
_VISIBLE_SLUGS = [
    "extraction",
    "metadata_validation",
    "line_item_matching",
    "bill_posting",
]


@router.get("/invoices/{invoice_id}/stages-status")
async def list_stages_status(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"current_stage": 1, "status": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    docs = await executed_stages(db).find({"run_id": oid}).to_list(length=None)
    by_slug = {d.get("stage_slug"): d for d in docs}

    stages = []
    for slug in _VISIBLE_SLUGS:
        s = by_slug.get(slug, {})
        approved_at = s.get("approved_at")
        approved_by = s.get("approved_by")
        stages.append({
            "slug": slug,
            "display_name": STAGE_DISPLAY.get(slug, slug.replace("_", " ").title()),
            "status": s.get("status", "pending"),  # pending | in_progress | in_review | approved | completed | rejected
            "approved_at": approved_at.isoformat() if isinstance(approved_at, datetime) else approved_at,
            "approved_by": str(approved_by) if isinstance(approved_by, ObjectId) else approved_by,
        })

    return _envelope(data={
        "stages": stages,
        "current_slug": (run.get("current_stage") or {}).get("slug"),
        "run_status": run.get("status", "in_progress"),
    })

"""Audit trail / activity log endpoints."""
from fastapi import APIRouter, HTTPException, Query

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import audit_log, invoices, pipeline_runs

router = APIRouter(tags=["activity"])


from ._common import _envelope, _oid


def _ser_entry(doc: dict) -> dict:
    from bson import ObjectId
    from datetime import datetime
    out = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, dict):
            out[k] = _ser_entry(v)
        else:
            out[k] = v
    return out


# ── GET /api/v1/invoices/{id}/activity ────────────────────────────────────────

@router.get("/invoices/{invoice_id}/activity")
async def get_invoice_activity(
    invoice_id: str,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Look up invoice _id so we can match old entries keyed by invoice_id
    inv = await invoices(db).find_one({"run_id": oid}, {"_id": 1}) or {}
    inv_id = inv.get("_id")

    query: dict = {"$or": [{"run_id": oid}]}
    if inv_id:
        query["$or"].append({"invoice_id": inv_id})

    cursor = audit_log(db).find(query).sort("created_at", -1).limit(limit)
    entries = await cursor.to_list(length=limit)
    return _envelope(data=[_ser_entry(e) for e in entries])


# ── GET /api/v1/activity (global audit log, admin/editor only) ────────────────

@router.get("/activity")
async def get_global_activity(
    current_user: CurrentUser,
    limit: int = Query(default=100, ge=1, le=500),
):
    db = get_db()
    cursor = audit_log(db).find({}).sort("created_at", -1).limit(limit)
    entries = await cursor.to_list(length=limit)
    return _envelope(data=[_ser_entry(e) for e in entries])

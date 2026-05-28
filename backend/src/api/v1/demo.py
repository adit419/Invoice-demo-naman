"""Demo control endpoints: reset + seed sample invoices."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import (
    attachments, bboxes, bills, documents, email_log,
    erp_cache, executed_stages, executed_tasks, invoices, jobs,
    matching, pipeline_runs,
)
from ...services.fixtures import get_loader

router = APIRouter(tags=["demo"])


from ._common import _envelope, _require_admin


# ── DELETE /api/v1/demo/reset ─────────────────────────────────────────────────

@router.delete("/demo/reset")
async def reset_demo(current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()

    # Drop all invoice-related collections, keep users, token_blocklist, pipelines, stage_definitions, task_definitions
    dropped = []
    for coll_fn, name in [
        (invoices, "invoices"),
        (pipeline_runs, "pipeline_runs"),
        (executed_stages, "executed_stages"),
        (executed_tasks, "executed_tasks"),
        (bills, "bills"),
        (matching, "matching"),
        (bboxes, "bboxes"),
        (erp_cache, "erp_cache"),
        (email_log, "email_log"),
        (jobs, "jobs"),
        (documents, "documents"),
        (attachments, "attachments"),
    ]:
        result = await coll_fn(db).delete_many({})
        dropped.append({"collection": name, "deleted": result.deleted_count})

    return _envelope(data={"reset": True, "collections": dropped})


# ── POST /api/v1/demo/seed ────────────────────────────────────────────────────

@router.post("/demo/seed")
async def seed_demo(current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()

    loader = get_loader()
    bundles = loader.discover()
    now = datetime.now(timezone.utc)

    created = []
    for key, bundle in bundles.items():
        bp = bundle.bill_posting if isinstance(bundle.bill_posting, dict) else (bundle.bill_posting[0] if bundle.bill_posting else {})
        header = bp.get("bill_header", {})

        ex = bundle.extraction
        if isinstance(ex, list):
            ex = ex[0] if ex else {}
        invoice_schema_data = ex.get("invoice_schema", ex)
        metadata = invoice_schema_data.get("metadata", [])
        line_items = invoice_schema_data.get("line_items", [])
        bbox_schema = ex.get("bbox_schema", {})

        run_id = ObjectId()

        # job
        job_result = await jobs(db).insert_one({
            "status": "completed",
            "tenant_id": "demo",
            "file_name": f"{key}.pdf",
            "fixture_key": key,
            "created_at": now,
            "updated_at": now,
        })

        # document
        doc_result = await documents(db).insert_one({
            "job_id": job_result.inserted_id,
            "status": "processed",
            "fixture_key": key,
            "created_at": now,
        })

        # attachment
        await attachments(db).insert_one({
            "document_id": doc_result.inserted_id,
            "file_name": f"{key}.pdf",
            "content_hash": key,
            "storage_path": f"fixtures/{key}/invoice.pdf",
            "created_at": now,
        })

        # pipeline_run
        await pipeline_runs(db).insert_one({
            "_id": run_id,
            "document_id": doc_result.inserted_id,
            "status": "in_progress",
            "current_stage": {
                "slug": "extraction",
                "display_name": "Extraction",
                "status": "in_review",
            },
            "file_name": f"{key}.pdf",
            "fixture_key": key,
            "created_at": now,
            "updated_at": now,
        })

        # invoice
        vendor = next((m.get("value", "") for m in metadata if m.get("field") == "vendor_name"), "")
        inv_num = next((m.get("value", "") for m in metadata if m.get("field") == "invoice_number"), "")
        total = next((m.get("value", 0) for m in metadata if m.get("field") == "total_amount"), 0)
        currency = next((m.get("value", "USD") for m in metadata if m.get("field") == "currency"), "USD")

        await invoices(db).insert_one({
            "run_id": run_id,
            "status": "in_progress",
            "file_name": f"{key}.pdf",
            "fixture_key": key,
            "invoice_schema": {"metadata": metadata, "line_items": line_items},
            "vendor_name": vendor,
            "invoice_number": inv_num,
            "total_amount": float(total) if total else 0,
            "currency": currency,
            "created_at": now,
            "updated_at": now,
        })

        # bboxes
        await bboxes(db).insert_one({
            "run_id": run_id,
            "bbox_schema": bbox_schema,
            "created_at": now,
        })

        # executed_stages: ingestion=completed, extraction=in_review, rest=start
        from .stages import STAGE_SEQUENCE
        stage_records = [
            {
                "run_id": run_id,
                "stage_slug": "ingestion",
                "status": "completed",
                "started_at": now,
                "completed_at": now,
                "approved_by": None,
                "approved_at": None,
            },
            {
                "run_id": run_id,
                "stage_slug": "extraction",
                "status": "in_review",
                "started_at": now,
                "completed_at": None,
                "approved_by": None,
                "approved_at": None,
            },
        ]
        for slug in STAGE_SEQUENCE:
            if slug not in ("ingestion", "extraction"):
                stage_records.append({
                    "run_id": run_id,
                    "stage_slug": slug,
                    "status": "start",
                    "started_at": None,
                    "completed_at": None,
                    "approved_by": None,
                    "approved_at": None,
                })
        await executed_stages(db).insert_many(stage_records)

        created.append({"fixture_key": key, "invoice_id": str(run_id), "vendor": vendor})

    return _envelope(data={"seeded": len(created), "invoices": created})

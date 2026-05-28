"""
Core logic for email-triggered invoice ingestion.
Mirrors the manual upload flow in ingestion.py but sets source="email".
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId

from ..database import get_db
from ..db.collections import (
    attachments, bboxes, documents, executed_stages, invoices, jobs, pipeline_runs, tenants,
)
from ..services.fixtures import get_loader

# Email-ingested invoices land under the Neoflo tenant until per-sender
# tenant resolution is implemented. Slug matches SEED_TENANTS in db/seeder.py.
_EMAIL_DEFAULT_TENANT_SLUG = "neoflo"

_UPLOADS_DIR = Path(__file__).parents[3] / "uploads"


def _extract_meta(extraction: dict, field: str) -> Optional[str]:
    for m in extraction.get("invoice_schema", {}).get("metadata", []):
        if m.get("field") == field:
            return m.get("value") or None
    return None


async def ingest_from_email(
    sender: str,
    filename: str,
    pdf_bytes: bytes,
    tenant_id: Optional[ObjectId] = None,
) -> str:
    """
    Replicate the manual upload pipeline for an email-attached PDF.
    Returns the new pipeline_run _id as str.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    loader = get_loader()

    bundle = loader.resolve(filename)
    ext = bundle.extraction
    file_size = len(pdf_bytes)

    # Default to the Neoflo tenant when the caller doesn't pin one — without
    # this, the run gets tenant_id=None and the listing endpoint (which scopes
    # by current_user.effective_tenant_id) hides it from every logged-in user.
    if tenant_id is None:
        neoflo = await tenants(db).find_one({"slug": _EMAIL_DEFAULT_TENANT_SLUG})
        if neoflo:
            tenant_id = neoflo["_id"]

    job_res = await jobs(db).insert_one({
        "status": "processing",
        "source": "email",
        "tenant_id": tenant_id,
        "created_at": now,
        "updated_at": now,
    })
    job_id = job_res.inserted_id

    doc_res = await documents(db).insert_one({
        "job_id": job_id,
        "file_name": filename,
        "file_size": file_size,
        "content_type": "application/pdf",
        "status": "processing",
        "created_at": now,
        "updated_at": now,
    })
    doc_id = doc_res.inserted_id

    await attachments(db).insert_one({
        "document_id": doc_id,
        "file_name": filename,
        "file_size": file_size,
        "content_type": "application/pdf",
        "s3_key": None,
        "created_at": now,
    })

    vendor_name = _extract_meta(ext, "vendor_name")
    invoice_number = _extract_meta(ext, "invoice_number")
    currency = _extract_meta(ext, "currency")
    total_str = _extract_meta(ext, "total_amount")
    try:
        total_amount = float(str(total_str).replace(",", "")) if total_str else None
    except (ValueError, AttributeError):
        total_amount = None

    run_res = await pipeline_runs(db).insert_one({
        "document_id": doc_id,
        "pipeline_id": None,
        "tenant_id": tenant_id,
        "status": "in_progress",
        "current_stage": {
            "slug": "extraction",
            "display_name": "Extraction",
            "status": "in_review",
        },
        "fixture_key": bundle.key,
        "file_name": filename,
        "local_file_path": None,
        "source": "email",
        "source_meta": {"sender": sender},
        "stp_enabled": False,
        "created_at": now,
        "updated_at": now,
    })
    run_id = run_res.inserted_id

    if pdf_bytes:
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        local_path = _UPLOADS_DIR / f"{run_id}.pdf"
        local_path.write_bytes(pdf_bytes)
        await pipeline_runs(db).update_one(
            {"_id": run_id},
            {"$set": {"local_file_path": str(local_path)}},
        )

    await invoices(db).insert_one({
        "run_id": run_id,
        "vendor_name": vendor_name,
        "invoice_number": invoice_number,
        "currency": currency,
        "total_amount": total_amount,
        "status": "in_progress",
        "fixture_key": bundle.key,
        "invoice_schema": ext.get("invoice_schema", {}),
        "bbox_schema": ext.get("bbox_schema", {}),
        "created_at": now,
        "updated_at": now,
    })

    await bboxes(db).insert_one({
        "run_id": run_id,
        "bbox_schema": ext.get("bbox_schema", {}),
        "created_at": now,
    })

    await executed_stages(db).insert_one({
        "run_id": run_id,
        "stage_slug": "ingestion",
        "status": "completed",
        "started_at": now,
        "completed_at": now,
        "approved_by": None,
        "approved_at": None,
    })
    await executed_stages(db).insert_one({
        "run_id": run_id,
        "stage_slug": "extraction",
        "status": "in_review",
        "started_at": now,
        "completed_at": None,
        "approved_by": None,
        "approved_at": None,
    })
    # Canonical pipeline order — single source of truth in stages.py so email
    # ingestion never drifts from the manual-upload path. vendor_validation was
    # removed from the forward flow (folded into Matching); a stale local copy
    # here previously seeded an orphaned vendor_validation stage doc.
    from ..api.v1.stages import STAGE_SEQUENCE
    for slug in STAGE_SEQUENCE:
        if slug not in ("ingestion", "extraction"):
            await executed_stages(db).insert_one({
                "run_id": run_id,
                "stage_slug": slug,
                "status": "start",
                "started_at": None,
                "completed_at": None,
                "approved_by": None,
                "approved_at": None,
            })

    # Trigger global STP in background if enabled
    from ..api.v1.stp import get_global_stp, run_stp_for_pipeline
    import asyncio
    if await get_global_stp(db):
        asyncio.create_task(run_stp_for_pipeline(run_id))

    return str(run_id)

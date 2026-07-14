from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import (
    attachments,
    bboxes,
    documents,
    executed_stages,
    invoices,
    jobs,
    pipeline_runs,
)
from ...models.invoice import (
    MATCHED_STAGE_SLUGS,
    STAGE_PERCENT,
    InvoiceDetail,
    InvoiceListItem,
    InvoiceListResponse,
    InvoiceStatusResponse,
    KpiCounts,
    ScenarioChip,
    ScenariosResponse,
    UploadResponse,
    display_status_for_run,
    percent_for_run,
)
from ...services.fixtures import get_loader

router = APIRouter(tags=["ingestion"])

# uploads/ lives two levels above this file's package root: backend/uploads/
_UPLOADS_DIR = Path(__file__).parents[3] / "uploads"


from ._common import _envelope


def _extract_meta(extraction: dict, field: str) -> Optional[str]:
    for m in extraction.get("invoice_schema", {}).get("metadata", []):
        if m.get("field") == field:
            return m.get("value") or None
    return None


def _run_to_item(run: dict, doc: dict, inv: dict) -> InvoiceListItem:
    return InvoiceListItem(
        id=str(run["_id"]),
        file_name=doc.get("file_name", run.get("file_name", "")),
        vendor_name=inv.get("vendor_name"),
        invoice_number=inv.get("invoice_number"),
        total_amount=inv.get("total_amount"),
        currency=inv.get("currency"),
        status=display_status_for_run(run),
        fixture_key=run.get("fixture_key", ""),
        percent_complete=percent_for_run(run),
        source=run.get("source", "manual"),
        tag=run.get("tag"),
        stp_enabled=run.get("stp_enabled", False),
        created_at=run.get("created_at", datetime.now(timezone.utc)),
        updated_at=run.get("updated_at", datetime.now(timezone.utc)),
    )


# ── GET /api/v1/ingestion/scenarios ──────────────────────────────────────────

@router.get("/ingestion/scenarios")
async def list_scenarios(current_user: CurrentUser):
    loader = get_loader()
    chips = [ScenarioChip(**loader.scenario_display(k)) for k in loader.keys()]
    return _envelope(data=ScenariosResponse(scenarios=chips).model_dump())


# ── POST /api/v1/ingestion/upload ────────────────────────────────────────────

@router.post("/ingestion/upload")
async def upload_invoice(
    current_user: CurrentUser,
    file: UploadFile = File(...),
    email: Optional[str] = Form(None),
    tag: Optional[str] = Form(None),
):
    # All authenticated roles can process items per PRD §3.2
    pass  # no role restriction needed

    if email and "@" not in email:
        raise HTTPException(status_code=422, detail="Invalid notification email address")

    db = get_db()
    now = datetime.now(timezone.utc)
    loader = get_loader()

    bundle = loader.resolve(file.filename or "unknown.pdf")
    ext = bundle.extraction
    scenario = loader.scenario_display(bundle.key)

    # Read file bytes before any async DB work
    file_bytes = await file.read()
    file_ext = Path(file.filename or "invoice.pdf").suffix or ".pdf"
    file_size = len(file_bytes)

    # Resolve uploader's effective tenant (switched tenant takes precedence)
    from bson import ObjectId as _OID
    eff_tid = current_user.effective_tenant_id
    uploader_tenant_oid = _OID(eff_tid) if eff_tid else None

    # Ingestion chain: job → document → attachment
    job_result = await jobs(db).insert_one({
        "status": "processing",
        "source": "manual",
        "tenant_id": uploader_tenant_oid,
        "created_at": now,
        "updated_at": now,
    })
    job_id = job_result.inserted_id

    doc_result = await documents(db).insert_one({
        "job_id": job_id,
        "file_name": file.filename,
        "file_size": file_size,
        "content_type": file.content_type or "application/pdf",
        "status": "processing",
        "created_at": now,
        "updated_at": now,
    })
    doc_id = doc_result.inserted_id

    await attachments(db).insert_one({
        "document_id": doc_id,
        "file_name": file.filename,
        "file_size": file_size,
        "content_type": file.content_type or "application/pdf",
        "s3_key": None,
        "created_at": now,
    })

    # Extract metadata from fixture
    vendor_name = _extract_meta(ext, "vendor_name")
    invoice_number = _extract_meta(ext, "invoice_number")
    currency = _extract_meta(ext, "currency")
    total_str = _extract_meta(ext, "total_amount")
    try:
        total_amount = float(str(total_str).replace(",", "")) if total_str else None
    except (ValueError, AttributeError):
        total_amount = None

    # Create pipeline_run first (invoice references its _id as run_id)
    run_result = await pipeline_runs(db).insert_one({
        "document_id": doc_id,
        "pipeline_id": None,
        "tenant_id": uploader_tenant_oid,
        "status": "in_progress",
        "current_stage": {
            "slug": "extraction",
            "display_name": "Extraction",
            "status": "in_review",
        },
        "fixture_key": bundle.key,
        "file_name": file.filename,
        "local_file_path": None,  # filled in below after we know run_id
        "source": "manual",
        # "sender" is the notification address slot the bill-posted email reads
        # (same one the email-ingestion flow fills with the sender's address).
        "source_meta": {"sender": email} if email else {},
        "tag": tag,
        "stp_enabled": False,
        "created_at": now,
        "updated_at": now,
    })
    run_id = run_result.inserted_id

    # Save uploaded PDF locally
    if file_bytes:
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        local_path = _UPLOADS_DIR / f"{run_id}{file_ext}"
        local_path.write_bytes(file_bytes)
        await pipeline_runs(db).update_one(
            {"_id": run_id},
            {"$set": {"local_file_path": str(local_path)}},
        )

    inv_result = await invoices(db).insert_one({
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

    # Stage lifecycle records — ingestion completed, extraction in_review (tasks done by AI)
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
    # Remaining stages at start
    from .stages import STAGE_SEQUENCE
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
    from .stp import get_global_stp, run_stp_for_pipeline
    if await get_global_stp(db):
        import asyncio
        asyncio.create_task(run_stp_for_pipeline(run_id))

    return _envelope(data=UploadResponse(
        invoice_id=str(run_id),
        fixture_key=bundle.key,
        scenario=ScenarioChip(**scenario),
    ).model_dump())


# ── GET /api/v1/invoices ──────────────────────────────────────────────────────

@router.get("/invoices")
async def list_invoices(
    current_user: CurrentUser,
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 50,
):
    db = get_db()

    query: dict = {}

    # Scope to effective tenant (active_tenant_id for switched admins, else own tenant)
    eff_tid = current_user.effective_tenant_id
    if eff_tid:
        from bson import ObjectId as _OID
        query["tenant_id"] = _OID(eff_tid)

    # Email-ingested invoices are scoped to the sender so demo users don't see
    # each other's uploads. Admins see all; manual uploads visible to everyone.
    if current_user.role != "tenant_admin":
        query["$or"] = [
            {"source": {"$ne": "email"}},
            {"source": "email", "source_meta.sender": current_user.email},
        ]

    if status_filter and status_filter != "all":
        # Map legacy frontend filter values to new status model
        if status_filter == "posted":
            query["status"] = "completed"
        elif status_filter == "rejected":
            query["status"] = "failed"
        elif status_filter == "matching":
            query["current_stage.slug"] = "line_item_matching"
        elif status_filter in ("extraction", "vendor_validation", "metadata_validation",
                               "line_item_matching", "bill_posting"):
            query["current_stage.slug"] = status_filter
        else:
            query["status"] = status_filter

    total = await pipeline_runs(db).count_documents(query)
    runs_cursor = pipeline_runs(db).find(query).sort("created_at", -1).skip(skip).limit(limit)
    runs = await runs_cursor.to_list(length=limit)

    run_ids = [r["_id"] for r in runs]
    doc_ids = [r.get("document_id") for r in runs if r.get("document_id")]

    docs_list = await documents(db).find({"_id": {"$in": doc_ids}}).to_list(length=limit)
    invs_list = await invoices(db).find({"run_id": {"$in": run_ids}}).to_list(length=limit)

    docs_map = {d["_id"]: d for d in docs_list}
    invs_map = {i["run_id"]: i for i in invs_list}

    items = [
        _run_to_item(run, docs_map.get(run.get("document_id"), {}), invs_map.get(run["_id"], {}))
        for run in runs
    ]

    # KPI counts — scoped to same effective tenant and sender filter as the listing
    tenant_filter: dict = {"tenant_id": query["tenant_id"]} if "tenant_id" in query else {}
    if "$or" in query:
        tenant_filter["$or"] = query["$or"]
    total_all = await pipeline_runs(db).count_documents(tenant_filter)
    awaiting = await pipeline_runs(db).count_documents({
        **tenant_filter,
        "status": "in_progress",
        "current_stage.status": "in_review",
    })
    matched = await pipeline_runs(db).count_documents({
        **tenant_filter,
        "status": "in_progress",
        "current_stage.slug": {"$in": list(MATCHED_STAGE_SLUGS)},
    })
    posted_count = await pipeline_runs(db).count_documents({**tenant_filter, "status": "completed"})

    kpi = KpiCounts(total=total_all, awaiting_action=awaiting, matched=matched, posted=posted_count)

    return _envelope(data=InvoiceListResponse(items=items, total=total, kpi=kpi).model_dump())


# ── GET /api/v1/invoices/{id} ─────────────────────────────────────────────────

@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    doc = await documents(db).find_one({"_id": run.get("document_id")}) or {}
    inv = await invoices(db).find_one({"run_id": oid}) or {}

    status_val = run.get("status", "extraction")
    item = _run_to_item(run, doc, inv)
    detail = InvoiceDetail(
        **item.model_dump(),
        current_stage=status_val,
        document_id=str(run.get("document_id", "")),
    )
    return _envelope(data=detail.model_dump())


# ── GET /api/v1/invoices/{id}/status ─────────────────────────────────────────

@router.get("/invoices/{invoice_id}/status")
async def get_invoice_status(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    run = await pipeline_runs(db).find_one({"_id": oid}, {"status": 1, "current_stage": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    cs = run.get("current_stage") or {}
    return _envelope(data=InvoiceStatusResponse(
        status=run.get("status", "pending"),
        current_stage=cs.get("slug", ""),
        percent_complete=percent_for_run(run),
    ).model_dump())


# ── GET /api/v1/invoices/{id}/file ────────────────────────────────────────────

@router.get("/invoices/{invoice_id}/file")
async def get_invoice_file(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    run = await pipeline_runs(db).find_one({"_id": oid}, {"local_file_path": 1, "fixture_key": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # 1. Try locally uploaded file
    local = run.get("local_file_path")
    if local:
        p = Path(local)
        if p.exists():
            return FileResponse(str(p), media_type="application/pdf")

    # 2. Fall back to fixture PDF bundled in the codebase
    fixture_key = run.get("fixture_key", "")
    loader = get_loader()
    fixture_pdf = loader._root / fixture_key / "invoice.pdf"
    if fixture_pdf.exists():
        return FileResponse(str(fixture_pdf), media_type="application/pdf")

    raise HTTPException(status_code=404, detail="PDF file not found")


# ── GET /api/v1/invoices/{id}/stages ─────────────────────────────────────────

STAGE_DISPLAY_NAMES = {
    "ingestion": "Ingestion",
    "extraction": "Extraction",
    "vendor_validation": "Vendor Validation",
    "metadata_validation": "Metadata Validation",
    "line_item_matching": "Line Item Matching",
    "bill_posting": "Bill Posting",
}

STAGE_SEQUENCE_NAV = [
    "ingestion", "extraction", "vendor_validation",
    "metadata_validation", "line_item_matching", "bill_posting",
]

@router.get("/invoices/{invoice_id}/stages")
async def get_invoice_stage_statuses(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invoice ID")

    run = await pipeline_runs(db).find_one({"_id": oid}, {"status": 1, "current_stage": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    stage_docs = await executed_stages(db).find({"run_id": oid}).to_list(length=20)
    stage_map = {s["stage_slug"]: s.get("status", "start") for s in stage_docs}

    pipeline_status = run.get("status", "pending")

    stages = []
    for slug in STAGE_SEQUENCE_NAV:
        stages.append({
            "slug": slug,
            "display_name": STAGE_DISPLAY_NAMES.get(slug, slug),
            "status": stage_map.get(slug, "start"),
        })

    return _envelope(data={
        "pipeline_status": pipeline_status,
        "stages": stages,
    })

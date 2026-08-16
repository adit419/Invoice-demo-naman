"""
DirectPay — fixture-driven contract<->invoice matching demo.

Mirrors the `cash`/`claim` module pattern (self-contained package, own
router, own storage, own prefix, auth-only gating) rather than plugging into
the P2P pipeline's `stages.py` state machine, which is hard-wired to P2P's
stage vocabulary. See fixtures.py's docstring for the fixture-resolution
algorithm (identical to fixtures/loader.py's, applied to a separate
fixtures/dp/ root).

Status vocabulary mirrors Invoice Processing's real pipeline shape exactly
(see backend/src/api/v1/stages.py's STAGE_SEQUENCE) — the only intentional
difference between the two is what Matching compares against (Purchase
Order there, Contract here):
  contract: review -> postprocessing -> saved (postprocessing only when the
            vendor has a real payment_schedule.json; otherwise review -> saved)
  invoice:  extraction -> extracted -> matching -> bill_posting -> posted
            (rejected is a possible exit from matching or bill_posting)

This module is a thin HTTP layer — all business logic lives in service.py so
Auto-Process (stp.py) can call the exact same functions a human's click
would, never a bespoke duplicate.
"""
import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from ..auth.deps import CurrentUser, get_current_user
from ..database import get_db
from ..api.v1._common import _envelope, _oid
from . import field_mapping, service
from .fixtures import get_dp_loader
from .models import (
    DpAckThresholdRequest,
    DpAcknowledgeRequest,
    DpBillPostingEditRequest,
    DpContractApproveRequest,
    DpContractEditRequest,
    DpContractTriggerUploadRequest,
    DpFpAcknowledgeRequest,
    DpFpApproveRequest,
    DpInvoiceConfirmExtractionRequest,
    DpInvoiceEditRequest,
    DpInvoiceMatchRequest,
    DpReviewActionRequest,
    DpStpRequest,
    DpTriggerUploadRequest,
)
from .store import dp_contract_runs, dp_invoice_runs
from .stp import get_dp_ack_threshold, get_global_dp_stp, run_dp_stp_for_invoice, set_dp_ack_threshold, set_global_dp_stp

router = APIRouter(dependencies=[Depends(get_current_user)])


def _not_found(exc: service.NotFoundError):
    raise HTTPException(status_code=404, detail=exc.message)


# ── Fixtures (debug/dev convenience) ──────────────────────────────────────────

@router.get("/fixtures")
async def list_fixtures():
    loader = get_dp_loader()
    bundles = loader.discover()
    return _envelope(data={
        "scenarios": [
            {"key": key, "label": bundle.display_label()}
            for key, bundle in bundles.items()
        ]
    })


@router.get("/field-mapping")
async def get_field_mapping():
    return _envelope(data={
        "mappings": [field_mapping.field_mapping_out(m) for m in field_mapping.get_field_mappings()]
    })


# ── Settings ───────────────────────────────────────────────────────────────────

@router.get("/settings/stp")
async def get_stp_setting():
    db = get_db()
    return _envelope(data={"stp_enabled": await get_global_dp_stp(db)})


@router.patch("/settings/stp")
async def update_stp_setting(body: DpStpRequest, current_user: CurrentUser):
    if current_user.role not in ("tenant_admin", "workspace_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    db = get_db()
    await set_global_dp_stp(db, body.enabled)
    return _envelope(data={"stp_enabled": body.enabled})


@router.get("/settings/ack-threshold")
async def get_ack_threshold_setting():
    db = get_db()
    return _envelope(data={"ack_threshold": await get_dp_ack_threshold(db)})


@router.patch("/settings/ack-threshold")
async def update_ack_threshold_setting(body: DpAckThresholdRequest, current_user: CurrentUser):
    if current_user.role not in ("tenant_admin", "workspace_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if body.value < 1:
        raise HTTPException(status_code=400, detail="Threshold must be a whole number >= 1")
    db = get_db()
    await set_dp_ack_threshold(db, body.value)
    return _envelope(data={"ack_threshold": body.value})


# ── Contracts ──────────────────────────────────────────────────────────────────

@router.post("/contracts/upload")
async def upload_contract(file: UploadFile = File(...)):
    db = get_db()
    try:
        return _envelope(data=await service.upload_contract(db, file.filename or ""))
    except service.NotFoundError as exc:
        _not_found(exc)


# Mirrors /ingestion/trigger-upload on the invoice side: same effect as the
# multipart endpoint above, but referenced by file name only — no bytes sent.
# The FE uses this instead of the real upload when the file is large enough
# that pushing its bytes through the dev proxy isn't worth it (fixture
# resolution and the PDF preview both work off the file name alone anyway).
@router.post("/contracts/trigger-upload")
async def trigger_upload_contract(body: DpContractTriggerUploadRequest):
    if not body.file_name.strip():
        raise HTTPException(status_code=422, detail="file_name is required")
    db = get_db()
    try:
        return _envelope(data=await service.upload_contract(db, body.file_name.strip()))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/contracts")
async def list_contracts():
    db = get_db()
    return _envelope(data={"items": await service.list_contracts(db)})


@router.get("/contracts/{run_id}")
async def get_contract(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_contract(db, _oid(run_id, "contract ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/contracts/{run_id}/pdf")
async def get_contract_pdf(run_id: str):
    db = get_db()
    doc = await dp_contract_runs(db).find_one({"_id": _oid(run_id, "contract ID")})
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    if not bundle or not bundle.contract_pdf_path:
        raise HTTPException(status_code=404, detail="Contract PDF not available")
    return Response(content=bundle.contract_pdf_path.read_bytes(), media_type="application/pdf")


@router.patch("/contracts/{run_id}/edit")
async def edit_contract(run_id: str, body: DpContractEditRequest):
    db = get_db()
    try:
        return _envelope(data=await service.edit_contract(db, _oid(run_id, "contract ID"), body.fields))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/contracts/{run_id}/approve")
async def approve_contract(run_id: str, body: DpContractApproveRequest):
    db = get_db()
    try:
        return _envelope(data=await service.approve_contract(db, _oid(run_id, "contract ID"), body.fields))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/contracts/{run_id}/extraction-postprocessing")
async def get_contract_extraction_postprocessing(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_contract_extraction_postprocessing(db, _oid(run_id, "contract ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/contracts/{run_id}/extraction-postprocessing/approve")
async def approve_contract_extraction_postprocessing(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.approve_contract_extraction_postprocessing(db, _oid(run_id, "contract ID")))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


# ── Invoices ───────────────────────────────────────────────────────────────────

async def _upload_invoice_by_filename(filename: str, email: str | None = None, tag: str | None = None) -> dict:
    """Shared by /invoices/upload and /ingestion/trigger-upload — both just
    resolve a fixture by name and kick off Auto-Process the same way; the
    only difference is where the name comes from (a real upload vs. a
    trigger request body)."""
    db = get_db()
    try:
        result = await service.upload_invoice(db, filename or "", email, tag)
    except service.NotFoundError as exc:
        _not_found(exc)
        return {}
    if await get_global_dp_stp(db):
        from bson import ObjectId
        asyncio.create_task(run_dp_stp_for_invoice(ObjectId(result["id"])))
    return result


@router.post("/invoices/upload")
async def upload_invoice(file: UploadFile = File(...)):
    return _envelope(data=await _upload_invoice_by_filename(file.filename or ""))


# ── Ingestion (trigger by filename, no file bytes) ────────────────────────────
# Mirrors P2P's own POST /api/v1/ingestion/trigger-upload: same effect as a
# real upload, but the invoice is referenced by a fixture-resolvable file
# name instead of actual bytes — DirectPay's fixture resolution already
# works off the filename alone, so this is the exact same call the multipart
# endpoint above makes.

@router.post("/ingestion/trigger-upload")
async def trigger_upload_invoice(body: DpTriggerUploadRequest):
    if not body.file_name.strip():
        raise HTTPException(status_code=422, detail="file_name is required")
    if body.email and "@" not in body.email:
        raise HTTPException(status_code=422, detail="Invalid notification email address")
    return _envelope(data=await _upload_invoice_by_filename(body.file_name.strip(), body.email, body.tag))


@router.get("/invoices")
async def list_invoices():
    db = get_db()
    return _envelope(data={"items": await service.list_invoices(db)})


@router.get("/invoices/{run_id}")
async def get_invoice(run_id: str):
    db = get_db()
    try:
        doc = await service.get_invoice_doc(db, _oid(run_id, "invoice ID"))
    except service.NotFoundError as exc:
        _not_found(exc)
        return
    return _envelope(data=await service.invoice_out(db, doc))


@router.get("/invoices/{run_id}/pdf")
async def get_invoice_pdf(run_id: str):
    db = get_db()
    doc = await dp_invoice_runs(db).find_one({"_id": _oid(run_id, "invoice ID")})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    # A multi-invoice vendor folder (documents.json) serves that specific
    # document's own PDF; a single-invoice folder keeps using the bundle's
    # invoice_pdf_path exactly as before.
    document = service._document_entry(bundle, doc.get("document_key"))
    pdf_path = document.pdf_path if document else (bundle.invoice_pdf_path if bundle else None)
    if not pdf_path:
        raise HTTPException(status_code=404, detail="Invoice PDF not available")
    return Response(content=pdf_path.read_bytes(), media_type="application/pdf")


# A vendor whose Faktur Pajak was uploaded as its own separate physical
# document (e.g. Palladium's invoice_fp_4/5/6.pdf) needs its own PDF route —
# unlike PT_BANGUN, where the FP is just page 2 of the same invoice PDF and
# the FP Extraction page keeps using GET .../pdf for that. Falls back to the
# invoice's own PDF when no separate FP document exists, so a caller that
# doesn't check has_own_pdf first still gets something sensible.
@router.get("/invoices/{run_id}/faktur-pajak/pdf")
async def get_invoice_faktur_pajak_pdf(run_id: str):
    db = get_db()
    doc = await dp_invoice_runs(db).find_one({"_id": _oid(run_id, "invoice ID")})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    document = service._document_entry(bundle, doc.get("document_key"))
    pdf_path = (
        document.faktur_pajak_pdf_path if document and document.faktur_pajak_pdf_path
        else (document.pdf_path if document else (bundle.invoice_pdf_path if bundle else None))
    )
    if not pdf_path:
        raise HTTPException(status_code=404, detail="Faktur Pajak PDF not available")
    return Response(content=pdf_path.read_bytes(), media_type="application/pdf")


@router.post("/invoices/{run_id}/extract")
async def extract_invoice(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.extract_invoice(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.patch("/invoices/{run_id}/edit")
async def edit_invoice(run_id: str, body: DpInvoiceEditRequest, current_user: CurrentUser):
    db = get_db()
    try:
        return _envelope(data=await service.edit_invoice(db, _oid(run_id, "invoice ID"), body.extracted, current_user.email))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/invoices/{run_id}/confirm-extraction")
async def confirm_extraction(run_id: str, body: DpInvoiceConfirmExtractionRequest, current_user: CurrentUser):
    db = get_db()
    try:
        return _envelope(data=await service.confirm_extraction(db, _oid(run_id, "invoice ID"), body.extracted, current_user.email))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/invoices/{run_id}/edit-history")
async def get_edit_history(run_id: str):
    db = get_db()
    try:
        return _envelope(data={"items": await service.get_edit_history(db, _oid(run_id, "invoice ID"))})
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/invoices/{run_id}/extraction-postprocessing")
async def get_extraction_postprocessing(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_extraction_postprocessing(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/invoices/{run_id}/extraction-postprocessing/approve")
async def approve_extraction_postprocessing(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.approve_extraction_postprocessing(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.get("/invoices/{run_id}/faktur-pajak")
async def get_faktur_pajak(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_faktur_pajak(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/invoices/{run_id}/faktur-pajak/acknowledge")
async def acknowledge_fp_field(run_id: str, body: DpFpAcknowledgeRequest):
    db = get_db()
    try:
        acked = await service.acknowledge_fp_field(db, _oid(run_id, "invoice ID"), body.field_name, body.acknowledged)
    except service.NotFoundError as exc:
        _not_found(exc)
        return
    return _envelope(data={"ok": True, "acknowledged_fields": acked})


@router.post("/invoices/{run_id}/faktur-pajak/approve")
async def approve_faktur_pajak(run_id: str, body: DpFpApproveRequest):
    db = get_db()
    oid = _oid(run_id, "invoice ID")
    try:
        result = await service.approve_faktur_pajak(db, oid, body.force)
    except service.NotFoundError as exc:
        _not_found(exc)
        return
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)
    except service.NeedsConfirmationError as exc:
        return Response(
            content=f'{{"ok": false, "needs_confirmation": true, "message": "{exc.message}"}}',
            status_code=409,
            media_type="application/json",
        )
    return _envelope(data=result)


@router.get("/invoices/{run_id}/contract-recommendation")
async def get_contract_recommendation(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_contract_recommendation(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/invoices/{run_id}/match")
async def match_invoice(run_id: str, body: DpInvoiceMatchRequest):
    db = get_db()
    try:
        return _envelope(data=await service.match_invoice(
            db, _oid(run_id, "invoice ID"), _oid(body.contract_id, "contract ID")
        ))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.post("/validate/acknowledge")
async def acknowledge_finding(body: DpAcknowledgeRequest):
    db = get_db()
    oid = _oid(body.invoice_id, "invoice ID")
    try:
        acked = await service.acknowledge_finding(db, oid, body.finding_id, body.acknowledged)
    except service.NotFoundError as exc:
        _not_found(exc)
        return
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _envelope(data={"ok": True, "acknowledged_findings": acked})


@router.post("/validate/review-action")
async def review_action(body: DpReviewActionRequest):
    db = get_db()
    oid = _oid(body.invoice_id, "invoice ID")
    try:
        result = await service.review_action(db, oid, body.action, body.reason)
    except service.NotFoundError as exc:
        _not_found(exc)
        return
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)
    except service.NeedsConfirmationError as exc:
        return Response(
            content=f'{{"ok": false, "needs_confirmation": true, "message": "{exc.message}"}}',
            status_code=409,
            media_type="application/json",
        )
    return _envelope(data=result)


# ── Bill Posting ───────────────────────────────────────────────────────────────

@router.get("/invoices/{run_id}/bill-posting")
async def get_bill_posting(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_bill_posting(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.patch("/invoices/{run_id}/bill-posting")
async def edit_bill_posting(run_id: str, body: DpBillPostingEditRequest):
    db = get_db()
    try:
        return _envelope(data=await service.edit_bill_posting(db, _oid(run_id, "invoice ID"), body.line_items))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.post("/invoices/{run_id}/bill-posting/post")
async def post_bill(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.post_bill(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.post("/invoices/{run_id}/bill-posting/simulate")
async def simulate_bill_posting(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.simulate_bill_posting(db, _oid(run_id, "invoice ID")))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)

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
from ..config import settings
from ..database import get_db
from ..api.v1._common import _envelope, _oid
from . import field_mapping, service
from .fixtures import get_dp_loader
from .models import (
    DpAckThresholdRequest,
    DpAcknowledgeRequest,
    DpBillPostingEditRequest,
    DpBillPostingSimulateRequest,
    DpContractApproveRequest,
    DpContractEditRequest,
    DpContractPostprocessingEditRequest,
    DpContractTriggerUploadRequest,
    DpEscalateRequest,
    DpFpAcknowledgeRequest,
    DpFpApproveRequest,
    DpInvoiceConfirmExtractionRequest,
    DpInvoiceEditRequest,
    DpInvoiceMatchRequest,
    DpMatchedInstallmentRequest,
    DpReviewActionRequest,
    DpStpRequest,
    DpTotalBeforeVatThresholdRequest,
    DpTriggerUploadRequest,
)
from .store import dp_contract_runs, dp_invoice_runs
from .stp import (
    get_dp_ack_threshold,
    get_dp_total_before_vat_threshold,
    get_global_dp_stp,
    resume_dp_stp_if_enabled,
    run_dp_stp_for_contract,
    run_dp_stp_for_invoice,
    set_dp_ack_threshold,
    set_dp_total_before_vat_threshold,
    set_global_dp_stp,
)

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


# Configured in the admin Workflow Settings page (DirectPay section), so the
# PATCH is admin-gated like the STP/Ack-Threshold settings above. The GET stays
# open — the Matching page's variance bar reads it to show the tolerance and cap.
@router.get("/settings/total-before-vat-threshold")
async def get_total_before_vat_threshold_setting():
    db = get_db()
    return _envelope(data=await get_dp_total_before_vat_threshold(db))


@router.patch("/settings/total-before-vat-threshold")
async def update_total_before_vat_threshold_setting(body: DpTotalBeforeVatThresholdRequest, current_user: CurrentUser):
    if current_user.role not in ("tenant_admin", "workspace_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if body.threshold_pct < 0:
        raise HTTPException(status_code=400, detail="Threshold must be a percentage >= 0")
    db = get_db()
    await set_dp_total_before_vat_threshold(db, body.enabled, body.threshold_pct)
    return _envelope(data={"enabled": body.enabled, "threshold_pct": body.threshold_pct})


# Clears DirectPay's processing data and nothing else — see service.reset_dp_data
# for exactly what goes and what stays. Admin-gated like the settings above, and
# DELETE rather than POST because it only ever destroys.
@router.delete("/data")
async def reset_data(current_user: CurrentUser):
    if current_user.role not in ("tenant_admin", "workspace_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    db = get_db()
    counts = await service.reset_dp_data(db)
    return _envelope(data={"deleted": counts, "total": sum(counts.values())})


# ── Contracts ──────────────────────────────────────────────────────────────────

async def _upload_contracts_by_filename(
    file_names: list[str], email: str | None = None, tag: str | None = None, source: str = "manual",
) -> list[dict]:
    """One contract run per file — each is resolved to its own fixture and
    extracted separately. Several contracts can be uploaded in one go (a vendor
    set is usually onboarded together), and unlike the invoice side there is no
    dedupe: two files always mean two runs.

    Kicks off Auto-Process per run when the DirectPay toggle is on, exactly as
    _upload_invoice_by_filename does for invoices — the contract cascade is
    ungated, so each of these ends up saved (see stp._cascade_dp_contract)."""
    db = get_db()
    results: list[dict] = []
    duplicates: list[dict] = []
    for name in file_names:
        try:
            results.append(await service.upload_contract(db, name, email, tag, source))
        except service.DuplicateInvoiceError as dup:
            duplicates.append({"file_name": name, **dup.to_payload()})
            asyncio.create_task(service.notify_dp_duplicate_rejected(db, duplicates[-1], tag))
        except service.NotFoundError as exc:
            # Only when NO scenarios are configured at all — a name that matches
            # nothing still resolves to some bundle (see DpFixtureLoader.resolve).
            _not_found(exc)
    if await get_global_dp_stp(db):
        from bson import ObjectId
        for result in results:
            asyncio.create_task(run_dp_stp_for_contract(ObjectId(result["id"])))
    return results, duplicates


@router.post("/contracts/upload")
async def upload_contract(files: list[UploadFile] = File(..., alias="file")):
    """Accepts one or many files under the `file` field — the browser repeats the
    field name per file, so a single-file client is unchanged."""
    names = [f.filename or "" for f in files if (f.filename or "").strip()]
    if not names:
        raise HTTPException(status_code=422, detail="At least one file is required")
    runs, duplicates = await _upload_contracts_by_filename(names, source="manual")
    if not runs and duplicates:
        raise HTTPException(status_code=409, detail=duplicates[0])
    payload = _upload_payload(runs)
    if duplicates and isinstance(payload, dict):
        payload["duplicates"] = duplicates
    return _envelope(data=payload)


# Mirrors /ingestion/trigger-upload on the invoice side: same effect as the
# multipart endpoint above, but referenced by file name only — no bytes sent.
# The FE uses this instead of the real upload when the file is large enough
# that pushing its bytes through the dev proxy isn't worth it (fixture
# resolution and the PDF preview both work off the file name alone anyway).
#
# Payload is identical to the invoice trigger below — one mandatory `file_names`
# (a bare string or a list) plus optional `email`/`tag`. Shape validation lives
# on the model (DpTriggerUploadBase), so both endpoints reject the same bad
# requests with the same 422s rather than each re-checking by hand.
@router.post("/contracts/trigger-upload")
async def trigger_upload_contract(body: DpContractTriggerUploadRequest):
    runs, duplicates = await _upload_contracts_by_filename(
        body.file_names, body.email, body.tag, source="trigger")
    if not runs and duplicates:
        raise HTTPException(status_code=409, detail={"duplicates": duplicates})
    payload = _upload_payload(runs)
    if duplicates and isinstance(payload, dict):
        payload["duplicates"] = duplicates
    return _envelope(data=payload)


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
async def edit_contract(run_id: str, body: DpContractEditRequest, current_user: CurrentUser):
    db = get_db()
    try:
        return _envelope(data=await service.edit_contract(db, _oid(run_id, "contract ID"), body.fields, current_user.email))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.post("/contracts/{run_id}/approve")
async def approve_contract(run_id: str, body: DpContractApproveRequest, current_user: CurrentUser):
    db = get_db()
    try:
        return _envelope(data=await service.approve_contract(db, _oid(run_id, "contract ID"), body.fields, current_user.email))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/contracts/{run_id}/extraction-postprocessing")
async def get_contract_extraction_postprocessing(run_id: str):
    db = get_db()
    try:
        return _envelope(data=await service.get_contract_extraction_postprocessing(db, _oid(run_id, "contract ID")))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.patch("/contracts/{run_id}/extraction-postprocessing")
async def edit_contract_extraction_postprocessing(run_id: str, body: DpContractPostprocessingEditRequest, current_user: CurrentUser):
    db = get_db()
    try:
        return _envelope(data=await service.edit_contract_extraction_postprocessing(
            db, _oid(run_id, "contract ID"), body.installments, body.one_time_payments, current_user.email
        ))
    except service.NotFoundError as exc:
        _not_found(exc)


@router.get("/contracts/{run_id}/edit-history")
async def get_contract_edit_history(run_id: str):
    db = get_db()
    try:
        return _envelope(data={"items": await service.get_contract_edit_history(db, _oid(run_id, "contract ID"))})
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

async def _upload_invoice_by_filename(
    filename: str, email: str | None = None, tag: str | None = None, source: str = "manual"
) -> list[dict]:
    """Shared by /invoices/upload and /ingestion/trigger-upload — both just
    resolve a fixture by name and kick off Auto-Process the same way; the
    only difference is where the name comes from (a real upload vs. a
    trigger request body) — recorded as `source` so the dashboard can show
    the right icon (see service.invoice_out).

    Returns a LIST because one uploaded file can legitimately be several
    invoices: a vendor whose documents.json declares a `combined_upload`
    (GRAHA_MEGARIA's 6-page PDF holding four invoices) fans out into one run
    each. Every other upload returns a single-element list."""
    db = get_db()
    try:
        results, duplicates = await service.upload_invoice_documents(db, filename or "", email, tag, source)
    except service.NotFoundError as exc:
        _not_found(exc)
        return [], []
    if await get_global_dp_stp(db):
        from bson import ObjectId
        for result in results:
            asyncio.create_task(run_dp_stp_for_invoice(ObjectId(result["id"])))
    # An invoice refused as a duplicate still gets a notification when it arrived
    # via trigger-upload with an email — the sender asked to be told about this
    # invoice, and "we already have it" is exactly the kind of thing they need to
    # know. Fire-and-forget, same as every other notification.
    for dup in duplicates:
        asyncio.create_task(service.notify_dp_duplicate_rejected(db, dup, tag))
    return results, duplicates


def _upload_payload(results: list[dict]):
    """One run -> the run itself (the long-standing response shape). Several ->
    {"items": [...]}, the same shape the batch trigger already returns, so a
    client can normalise both with a single `items` check."""
    return results[0] if len(results) == 1 else {"items": results}


@router.post("/invoices/upload")
async def upload_invoice(file: UploadFile = File(...)):
    runs, duplicates = await _upload_invoice_by_filename(file.filename or "", source="manual")
    # Nothing created and the reason was "we already have this invoice" — a 409 is
    # the honest answer: the caller asked to create something and we declined.
    if not runs and duplicates:
        raise HTTPException(status_code=409, detail=duplicates[0])
    payload = _upload_payload(runs)
    if duplicates and isinstance(payload, dict):
        payload["duplicates"] = duplicates
    return _envelope(data=payload)


# ── Ingestion (trigger by filename, no file bytes) ────────────────────────────
# Mirrors P2P's own POST /api/v1/ingestion/trigger-upload: same effect as a
# real upload, but the invoice is referenced by a fixture-resolvable file
# name instead of actual bytes — DirectPay's fixture resolution already
# works off the filename alone, so this is the exact same call the multipart
# endpoint above makes.
#
# Extended (DP-only) to also accept a batch (file_names) in one call — a
# vendor's real documents can be a separate invoice + Faktur Pajak pair, a
# single file with the FP already embedded, or a mixed batch covering
# several documents at once. Each name is resolved through the exact same
# _upload_invoice_by_filename() a single-file call uses, so the existing
# fixture_key+document_key dedup in service.upload_invoice (a separate
# invoice + its own FP file collapse to one run) applies per file here too —
# batching changes nothing about how a file resolves, only how many of them
# a single request can carry. Note DpFixtureLoader.resolve() itself never 404s
# on a name it can't prefix-match against any scenario key — it falls back to
# an arbitrary configured bundle (pre-existing behavior, unchanged here) — so
# in practice every name in a batch resolves to *some* run; the only 422s are
# request-shape validation (empty file_names, missing email @).

@router.post("/ingestion/trigger-upload")
async def trigger_upload_invoice(body: DpTriggerUploadRequest):
    # Payload identical to the contract trigger above; shape validation
    # (non-empty names, well-formed email) lives on DpTriggerUploadBase.
    #
    # One name can still produce several runs (a combined multi-invoice PDF), and
    # two names can collapse onto ONE run (an invoice and its own Faktur Pajak
    # file) — so `items` is de-duplicated by run id while `files` keeps the
    # per-name mapping a caller needs to know which of its files went where.
    seen: dict[str, dict] = {}
    files: list[dict] = []
    duplicates: list[dict] = []
    for name in body.file_names:
        results, dups = await _upload_invoice_by_filename(name, body.email, body.tag, source="trigger")
        duplicates.extend(dups)
        for result in results:
            files.append({"file_name": name, "invoice_id": result.get("id")})
            seen.setdefault(result["id"], result)
    runs = list(seen.values())
    # Every name in the batch was already in the system — nothing was created, so
    # say so rather than returning an empty success.
    if not runs and duplicates:
        raise HTTPException(status_code=409, detail={"duplicates": duplicates})
    # A single resulting run keeps the bare-run response shape both upload
    # endpoints have always used; several return {"items": [...]}.
    payload = _upload_payload(runs)
    if isinstance(payload, dict) and "items" in payload:
        payload["files"] = files
    # A partly-duplicate batch still creates what it can, and reports the rest.
    if duplicates and isinstance(payload, dict):
        payload["duplicates"] = duplicates
    return _envelope(data=payload)


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


# One of several Faktur Pajak belonging to a single invoice (see fixtures.py's
# DpDocumentEntry.faktur_pajak_pdfs) — KARYA_NASTARI invoice_3's Admin Fee /
# Water / Electricity set, which is that invoice's own amount reference.
@router.get("/invoices/{run_id}/faktur-pajak/documents/{doc_index}/pdf")
async def get_invoice_faktur_pajak_document_pdf(run_id: str, doc_index: int):
    db = get_db()
    doc = await dp_invoice_runs(db).find_one({"_id": _oid(run_id, "invoice ID")})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    document = service._document_entry(bundle, doc.get("document_key"))
    pdfs = document.faktur_pajak_pdfs if document else []
    if doc_index < 0 or doc_index >= len(pdfs):
        raise HTTPException(status_code=404, detail="Faktur Pajak document not available")
    return Response(content=pdfs[doc_index]["path"].read_bytes(), media_type="application/pdf")


# The utility bill backing a charge the contract only bills "on actuals" (see
# fixtures.py's DpDocumentEntry.supporting_document_pdf_path). Unlike the
# invoice/FP PDFs there is no review stage for it — this exists purely so the
# Matching page's variance bar can link out to the document its reference
# amount came from.
@router.get("/invoices/{run_id}/supporting-document/pdf")
async def get_invoice_supporting_document_pdf(run_id: str):
    db = get_db()
    doc = await dp_invoice_runs(db).find_one({"_id": _oid(run_id, "invoice ID")})
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    document = service._document_entry(bundle, doc.get("document_key"))
    pdf_path = document.supporting_document_pdf_path if document else None
    if not pdf_path:
        raise HTTPException(status_code=404, detail="Supporting document PDF not available")
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
    oid = _oid(run_id, "invoice ID")
    try:
        result = await service.confirm_extraction(db, oid, body.extracted, current_user.email)
    except service.NotFoundError as exc:
        _not_found(exc)
        return
    # Auto-Process picks the invoice back up from here (no-op when it's off).
    await resume_dp_stp_if_enabled(db, oid)
    return _envelope(data=result)


# Which payment-schedule row this invoice is matched against. Amount proximity
# cannot disambiguate rows that share an amount, so a human can pin the correct
# instalment / service charge here and everything downstream follows.
@router.patch("/invoices/{run_id}/matched-installment")
async def set_matched_installment(run_id: str, body: DpMatchedInstallmentRequest):
    db = get_db()
    try:
        return _envelope(data=await service.set_matched_installment(
            db, _oid(run_id, "invoice ID"), body.installment_index))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)


@router.get("/invoices/{run_id}/edit-history")
async def get_edit_history(run_id: str):
    db = get_db()
    try:
        return _envelope(data={"items": await service.get_edit_history(db, _oid(run_id, "invoice ID"))})
    except service.NotFoundError as exc:
        _not_found(exc)


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
    # A human just cleared this stage — let Auto-Process carry on if it's on.
    await resume_dp_stp_if_enabled(db, oid)
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


@router.post("/invoices/{run_id}/escalate")
async def escalate_invoice(run_id: str, body: DpEscalateRequest | None = None):
    """Matching-stage Escalate. Mails the trigger-upload payload address; when the
    invoice has none, sends nothing and says so, and the UI keeps its existing
    local confirmation."""
    db = get_db()
    try:
        return _envelope(data=await service.escalate_invoice(
            db, _oid(run_id, "invoice ID"), body.note if body else None,
        ))
    except service.NotFoundError as exc:
        _not_found(exc)


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
    # A human just cleared this stage — let Auto-Process carry on if it's on.
    await resume_dp_stp_if_enabled(db, oid)
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


@router.get("/drive/check")
async def drive_check():
    """Is the Drive destination reachable? Run this after dropping in a new
    refresh token, BEFORE relying on any upload.

    Separates the failure modes that all look like a 403/404 otherwise: Drive API
    not enabled on the project, the `drive` scope missing from the token, or
    sales@neoflo.ai not being a member of the shared drive."""
    from ..services import drive_client
    if not drive_client.is_configured():
        return _envelope(data={
            "configured": False,
            "drive_enabled": settings.drive_enabled,
            "folder_id_set": bool(settings.drive_folder_id),
            "credential_set": bool(settings.gmail_refresh_token),
        })
    result = await drive_client.check_access()
    return _envelope(data={"configured": True, **result})


# ── Tracker ───────────────────────────────────────────────────────────────────
# Every invoice that has finished processing (posted or rejected), with the same
# figures its own Bill Posting page shows. Read-only; the FE does all filtering,
# sorting and CSV export over this one payload, exactly as the dashboard already
# does over /invoices — DirectPay has no server-side query layer to add to, and
# a fixture-driven demo's row count never justifies inventing one.
@router.get("/tracker")
async def list_tracker():
    db = get_db()
    return _envelope(data={"items": await service.list_tracker(db)})


@router.post("/invoices/{run_id}/bill-posting/simulate")
async def simulate_bill_posting(run_id: str, body: DpBillPostingSimulateRequest | None = None):
    db = get_db()
    try:
        return _envelope(data=await service.simulate_bill_posting(
            db, _oid(run_id, "invoice ID"), body.line_items if body else None,
        ))
    except service.NotFoundError as exc:
        _not_found(exc)
    except service.InvalidStateError as exc:
        raise HTTPException(status_code=400, detail=exc.message)

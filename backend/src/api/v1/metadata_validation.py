import copy
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import app_settings, executed_stages, field_acknowledgement_memory, invoices, pipeline_runs
from ...services.fixtures import get_loader
from ...services.invoice_state import get_invoice_schema, get_invoice_state
from .stages import approve_stage, reject_stage


_NORMALIZE_TRAILING = re.compile(r"[.,;:\s]+$")
_NORMALIZE_WHITESPACE = re.compile(r"\s+")


def _normalize(s) -> str:
    if s is None:
        return ""
    out = str(s).strip().lower()
    out = _NORMALIZE_TRAILING.sub("", out)
    out = _NORMALIZE_WHITESPACE.sub(" ", out)
    return out


def _recompute_match_status(invoice_val, po_val) -> str:
    """Mirror the frontend's fuzzy comparison (case + trailing punctuation insensitive)."""
    inv = _normalize(invoice_val)
    po = _normalize(po_val)
    if not inv or not po:
        return "mismatch"
    return "match" if inv == po else "mismatch"


def _apply_edits_to_fields(fields: list[dict], history: list[dict]) -> list[dict]:
    """Overlay metadata edits onto each field's `values.invoice[*].value` and
    recompute `match_status` against the PO value. Read-only fixture data is
    deep-copied so future requests still see the originals."""
    if not history:
        return fields

    latest_edits: dict[str, str | None] = {}
    sorted_history = sorted(history, key=lambda h: h.get("timestamp") or datetime.min)
    for entry in sorted_history:
        if entry.get("scope") != "metadata":
            continue
        field = entry.get("field")
        if not field:
            continue
        latest_edits[field] = entry.get("new_value")

    if not latest_edits:
        return fields

    out: list[dict] = []
    for f in fields:
        field_name = f.get("field_name")
        if field_name not in latest_edits:
            out.append(f)
            continue
        new_value = latest_edits[field_name]
        f = copy.deepcopy(f)
        values = f.setdefault("values", {})
        inv_list = values.get("invoice") or []
        if inv_list:
            inv_list[0] = {**inv_list[0], "value": new_value}
            values["invoice"] = inv_list
        else:
            values["invoice"] = [{"document_id": "", "value": new_value}]
        po_list = values.get("po") or []
        po_val = po_list[0].get("value") if po_list else None
        f["match_status"] = _recompute_match_status(new_value, po_val)
        out.append(f)
    return out

# ── Platform acknowledgement memory ──────────────────────────────────────────
#
# Mirrors invoice-validator-be/src/services/matching.py:
#   _normalize_value / save_acknowledgement_memory / apply_ack_history_and_memory
#
# Memory is keyed on (tenant_id, field_name, source_value) where source_value is
# the normalized PO value. On every manual acknowledge, a count is incremented for
# the (source_value → invoice_value) pair. When the count reaches ACK_THRESHOLD on
# a subsequent invoice, the field is auto-acknowledged with acknowledged_by='system'
# before the human reviewer even opens the page.

ACK_THRESHOLD = 3


def _normalize_for_memory(value) -> str:
    """Simple normalize for memory keys: strip + lowercase only.
    Intentionally less aggressive than _normalize() so minor punctuation
    differences (periods, commas) are preserved as distinct memory entries
    rather than collapsed — keeps the memory accurate.
    """
    if not value:
        return ""
    return str(value).strip().lower()


async def _save_acknowledgement_memory(
    db,
    tenant_id: str,
    field_name: str,
    source_value,   # PO / GRN value
    invoice_value,  # invoice extraction value
    user_id: str,
) -> None:
    """Upsert one (tenant, field, PO-value) → invoice-value count entry.

    Called after every manual acknowledge so the system learns from repetition.
    Skips silently when tenant_id is absent (unauthenticated / no-tenant demo).
    """
    if not tenant_id:
        return
    source_norm = _normalize_for_memory(source_value)
    # invoice_value can legitimately be "" (field not found on the invoice).
    # We still want to record that the user accepted "no value" against this PO
    # value so future invoices with the same absence are auto-approved.
    invoice_norm = _normalize_for_memory(invoice_value) if invoice_value is not None else ""
    if not source_norm:   # PO value must be present to key the memory
        return

    now = datetime.now(timezone.utc)
    coll = field_acknowledgement_memory(db)
    filter_q = {
        "tenant_id": ObjectId(tenant_id),
        "field_name": field_name,
        "source_value": source_norm,
    }
    doc = await coll.find_one(filter_q)
    if doc:
        counts: list[dict] = doc.get("acknowledgement_counts") or []
        entry = next((e for e in counts if e["v"] == invoice_norm), None)
        if entry:
            entry["c"] += 1
        else:
            counts.append({"v": invoice_norm, "c": 1})
        await coll.update_one(
            filter_q,
            {"$set": {
                "acknowledgement_counts": counts,
                "last_acknowledged_by": user_id,
                "last_acknowledged_at": now,
                "updated_at": now,
            }},
        )
    else:
        await coll.insert_one({
            **filter_q,
            "acknowledgement_counts": [{"v": invoice_norm, "c": 1}],
            "last_acknowledged_by": user_id,
            "last_acknowledged_at": now,
            "created_at": now,
            "updated_at": now,
        })


async def _apply_ack_memory(
    db,
    tenant_id: str,
    fields: list[dict],
    threshold: int = ACK_THRESHOLD,
) -> list[dict]:
    """Auto-acknowledge required mismatch fields whose (PO-value → invoice-value)
    pair has been manually acknowledged >= `threshold` times by this tenant.

    Sets acknowledged_by='system' to distinguish from manual user acks.
    Only acts on fields that are:
      - required
      - still a mismatch
      - NOT already acknowledged (manual acks from invoices.acknowledged_fields
        have already been overlaid by the caller before this is invoked)
    """
    if not tenant_id:
        return fields

    coll = field_acknowledgement_memory(db)
    out = []
    for f in fields:
        # Only consider required mismatch fields not yet acknowledged
        if (
            not f.get("required")
            or f.get("match_status") != "mismatch"
            or f.get("is_acknowledged")
        ):
            out.append(f)
            continue

        po_list = (f.get("values") or {}).get("po") or []
        inv_list = (f.get("values") or {}).get("invoice") or []
        raw_source = po_list[0].get("value") if po_list else None
        # invoice value may be None / "" when extraction didn't find the field —
        # we still want to match the memory entry the user created when accepting
        # that same absence (empty invoice value) against this PO value.
        raw_invoice = inv_list[0].get("value") if inv_list else None
        if raw_source is None:
            out.append(f)
            continue

        source_norm = _normalize_for_memory(raw_source)
        invoice_norm = _normalize_for_memory(raw_invoice) if raw_invoice is not None else ""
        if not source_norm:
            out.append(f)
            continue

        memory_doc = await coll.find_one({
            "tenant_id": ObjectId(tenant_id),
            "field_name": f.get("field_name"),
            "source_value": source_norm,
        })
        if memory_doc:
            count = next(
                (e["c"] for e in (memory_doc.get("acknowledgement_counts") or [])
                 if e.get("v") == invoice_norm),
                0,
            )
            if count >= threshold:
                f = {
                    **f,
                    "is_acknowledged": True,
                    "acknowledged_by": "system",
                    "acknowledged_at": datetime.now(timezone.utc).isoformat(),
                }
        out.append(f)
    return out


router = APIRouter(tags=["metadata_validation"])


from ._common import (
    _envelope,
    _extract_field,
    _oid,
    _require_editor,
    _unwrap_fixture,
)


# ── GET /api/v1/invoices/{id}/stages/metadata_validation ─────────────────────

@router.get("/invoices/{invoice_id}/stages/metadata_validation")
async def get_metadata_validation(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")
    tenant_id: str | None = str(run["tenant_id"]) if run.get("tenant_id") else None

    # Live extraction state: fixture extraction.json + replayed edit_history
    invoice_schema = await get_invoice_schema(db, oid)

    loader = get_loader()
    bundles = loader.discover()
    fixture_key = run.get("fixture_key", "")
    bundle = bundles.get(fixture_key)
    fixture = _unwrap_fixture(bundle.metadata_validation if bundle else {})
    vendor_fixture = _unwrap_fixture(bundle.vendor_validation if bundle else {})

    # vendor_validation is no longer its own stage — its fields are folded into
    # the metadata tab so the user sees vendor info alongside PO/customer data.
    # Vendor fields come first so they appear at the top of the merged list.
    merged_fields = list(vendor_fixture.get("fields", [])) + list(fixture.get("fields", []))

    # Overlay user edits from invoices.edit_history so the comparison table
    # reflects the latest invoice values (and recomputed match_status) instead
    # of the static fixture.
    inv = await invoices(db).find_one({"run_id": oid}, {"edit_history": 1, "acknowledged_fields": 1}) or {}
    merged_fields = _apply_edits_to_fields(merged_fields, inv.get("edit_history") or [])

    # Overlay workflow settings' mandatory+mask onto each field's `required`
    # property. This ensures the MetadataTab's asterisk (*), blocking mismatch
    # count, and row colours all reflect admin-configured mandatory settings
    # rather than the static fixture values.
    from .workflow_settings import get_workflow_settings as _get_wf_settings
    _wf = await _get_wf_settings(db)
    _meta_mandatory: set[str] = {
        f["key"]
        for f in _wf.get("metadata_validation", {}).get("fields", [])
        if f.get("mandatory") and f.get("mask", True)
    }
    _vendor_mandatory: set[str] = {
        f["key"]
        for f in _wf.get("vendor_validation", {}).get("fields", [])
        if f.get("mandatory") and f.get("mask", True)
    }
    _all_mandatory = _meta_mandatory | _vendor_mandatory
    merged_fields = [
        {**f, "required": f.get("field_name") in _all_mandatory}
        for f in merged_fields
    ]

    # Attach the invoice extraction confidence per field (Matching values all
    # originate from the invoice extraction). The Matching page flags a row red
    # when this confidence is below the field's configured Tolerance (%).
    state = await get_invoice_state(db, oid)
    conf_by_field = {
        b.get("field"): b.get("value_confidence")
        for b in (state.get("bbox_schema", {}) or {}).get("metadata", [])
    }
    merged_fields = [
        {**f, "value_confidence": conf_by_field.get(f.get("field_name"))}
        for f in merged_fields
    ]

    # Overlay persisted manual acknowledgements so the frontend can restore badge
    # state on page reload (is_acknowledged / acknowledged_by / acknowledged_at).
    ack_list: list[dict] = (inv.get("acknowledged_fields") or [])
    ack_by_field: dict[str, dict] = {a["field_name"]: a for a in ack_list if a.get("field_name")}
    merged_fields = [
        {
            **f,
            "is_acknowledged": f.get("field_name") in ack_by_field,
            "acknowledged_by": ack_by_field.get(f.get("field_name"), {}).get("acknowledged_by"),
            "acknowledged_at": (
                ack_by_field[f.get("field_name")]["acknowledged_at"].isoformat()
                if f.get("field_name") in ack_by_field
                and isinstance(ack_by_field[f.get("field_name")].get("acknowledged_at"), datetime)
                else ack_by_field.get(f.get("field_name"), {}).get("acknowledged_at")
            ),
        }
        for f in merged_fields
    ]

    # Apply tenant-level platform memory: auto-acknowledge required mismatch
    # fields whose (PO-value → invoice-value) pair has been manually acknowledged
    # >= ACK_THRESHOLD times across past invoices. These show the purple
    # "Auto-approved" badge (acknowledged_by='system').
    from .stp import get_global_ack_threshold
    threshold = await get_global_ack_threshold(db)
    merged_fields = await _apply_ack_memory(db, tenant_id, merged_fields, threshold=threshold)

    # Combine summaries: counts are additive; verdict is the worse of the two.
    meta_summary = fixture.get("summary", {}) or {}
    vendor_summary = vendor_fixture.get("summary", {}) or {}

    def _i(d: dict, k: str) -> int:
        v = d.get(k)
        return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0

    merged_matched = _i(meta_summary, "matched") + _i(vendor_summary, "matched")
    merged_mismatched = _i(meta_summary, "mismatched") + _i(vendor_summary, "mismatched")
    merged_total = merged_matched + merged_mismatched
    merged_pct = round(merged_matched * 100.0 / merged_total, 1) if merged_total else 0.0
    merged_verdict = "pass" if merged_mismatched == 0 else "fail"

    document_types = meta_summary.get("document_types") or vendor_summary.get("document_types") or ["invoice", "po"]
    summary = {
        **meta_summary,
        "matched": merged_matched,
        "mismatched": merged_mismatched,
        "match_percentage": merged_pct,
        "validation_result": merged_verdict,
        "document_types": document_types,
    }

    required_missing = list(vendor_fixture.get("required_missing_fields", []) or []) + list(fixture.get("required_missing_fields", []) or [])

    # Extract PO and GRN document IDs from the first field that has them
    po_doc_id = None
    grn_doc_id = None
    for f in merged_fields:
        vals = f.get("values", {})
        if po_doc_id is None:
            po_list = vals.get("po", [])
            if po_list:
                po_doc_id = po_list[0].get("document_id")
        if grn_doc_id is None and "grn" in document_types:
            grn_list = vals.get("grn", [])
            if grn_list:
                grn_doc_id = grn_list[0].get("document_id")
        if po_doc_id and grn_doc_id:
            break

    stage_doc = await executed_stages(db).find_one({"run_id": oid, "stage_slug": "metadata_validation"}) or {}

    return _envelope(data={
        "invoice_number": _extract_field(invoice_schema, "invoice_number"),
        "invoice_date": _extract_field(invoice_schema, "invoice_date"),
        "vendor_name": _extract_field(invoice_schema, "vendor_name"),
        "po_number": po_doc_id or _extract_field(invoice_schema, "po_number"),
        "grn_number": grn_doc_id,
        "file_name": run.get("file_name", ""),
        "fixture_key": fixture_key,
        "status": run.get("status", "in_progress"),
        "stage_status": stage_doc.get("status", "in_review"),
        "fields": merged_fields,
        "summary": summary,
        "document_types": document_types,
        "required_missing_fields": required_missing,
    })


# ── POST .../acknowledge ─────────────────────────────────────────────────────

class AcknowledgeRequest(BaseModel):
    field_names: list[str]


@router.post("/invoices/{invoice_id}/stages/metadata_validation/acknowledge")
async def acknowledge_metadata_fields(
    invoice_id: str,
    body: AcknowledgeRequest,
    current_user: CurrentUser,
):
    """Persist acknowledgements for one or more required mismatch fields.

    1. Upserts each field into `invoices.acknowledged_fields` (per-invoice record).
    2. For newly-acknowledged fields, writes a count entry into
       `field_acknowledgement_memory` (tenant-level platform memory) so future
       invoices with the same (field, PO-value) pair can be auto-acknowledged.
    """
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"fixture_key": 1, "tenant_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    now = datetime.now(timezone.utc)

    # ── 1. Upsert per-invoice acknowledged_fields ─────────────────────────────
    inv = await invoices(db).find_one({"run_id": oid}, {"acknowledged_fields": 1, "edit_history": 1}) or {}
    existing: list[dict] = list(inv.get("acknowledged_fields") or [])
    existing_by_name = {a["field_name"]: a for a in existing}

    # Track which fields are genuinely new this call (not already acked)
    # so we don't double-count in memory.
    newly_acknowledged = [fn for fn in body.field_names if fn not in existing_by_name]

    for fn in newly_acknowledged:
        existing_by_name[fn] = {
            "field_name": fn,
            "acknowledged_by": current_user.full_name,
            "acknowledged_at": now,
        }

    await invoices(db).update_one(
        {"run_id": oid},
        {"$set": {"acknowledged_fields": list(existing_by_name.values())}},
        upsert=True,
    )

    # ── 2. Write to platform memory for newly-acknowledged fields ─────────────
    # We need the current PO and invoice values for each field to key the memory.
    # Reconstruct them the same way the GET endpoint does (fixture + edit replay).
    tenant_id: str | None = str(run["tenant_id"]) if run.get("tenant_id") else None

    if newly_acknowledged and tenant_id:
        fixture_key = run.get("fixture_key", "")
        loader = get_loader()
        bundle = loader.discover().get(fixture_key)
        vendor_fix = _unwrap_fixture(bundle.vendor_validation if bundle else {})
        meta_fix = _unwrap_fixture(bundle.metadata_validation if bundle else {})
        all_fields = list(vendor_fix.get("fields", [])) + list(meta_fix.get("fields", []))
        all_fields = _apply_edits_to_fields(all_fields, inv.get("edit_history") or [])
        field_map = {f.get("field_name"): f for f in all_fields}

        for fn in newly_acknowledged:
            field = field_map.get(fn)
            if not field:
                continue
            po_list = (field.get("values") or {}).get("po") or []
            inv_list = (field.get("values") or {}).get("invoice") or []
            po_val = po_list[0].get("value") if po_list else None
            inv_val = inv_list[0].get("value") if inv_list else None
            if po_val is None or inv_val is None:
                continue
            await _save_acknowledgement_memory(
                db=db,
                tenant_id=tenant_id,
                field_name=fn,
                source_value=po_val,
                invoice_value=inv_val,
                user_id=current_user.id,
            )

    return _envelope(data={"acknowledged": body.field_names})


# ── POST .../unacknowledge ────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/stages/metadata_validation/unacknowledge")
async def unacknowledge_metadata_fields(
    invoice_id: str,
    body: AcknowledgeRequest,
    current_user: CurrentUser,
):
    """Remove acknowledgements for one or more fields (revert)."""
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    to_remove = set(body.field_names)
    inv = await invoices(db).find_one({"run_id": oid}, {"acknowledged_fields": 1}) or {}
    existing: list[dict] = list(inv.get("acknowledged_fields") or [])
    updated = [a for a in existing if a.get("field_name") not in to_remove]

    await invoices(db).update_one(
        {"run_id": oid},
        {"$set": {"acknowledged_fields": updated}},
        upsert=True,
    )
    return _envelope(data={"unacknowledged": body.field_names})


# ── POST .../approve ──────────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/stages/metadata_validation/approve")
async def approve_metadata_validation(
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
        slug="metadata_validation",
        current_user=current_user,
        action="metadata_validation.approved",
    )

    next_stage = result["next_stage"]
    redirect = f"/invoice/{invoice_id}/matching" if next_stage else f"/invoice/{invoice_id}"
    return _envelope(data={"next_stage": next_stage, "redirect": redirect})


# ── POST .../reject ───────────────────────────────────────────────────────────

class RejectRequest(BaseModel):
    reason: str


@router.post("/invoices/{invoice_id}/stages/metadata_validation/reject")
async def reject_metadata_validation(
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

    await reject_stage(db, oid, "metadata_validation", current_user, body.reason)

    return _envelope(data={"status": "rejected"})

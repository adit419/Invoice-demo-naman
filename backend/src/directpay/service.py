"""
DirectPay core business logic — the shared layer both the HTTP router
(router.py) and the Auto-Process cascade (stp.py) call into, so a human's
click and STP's automated equivalent always run the exact same code path.
Mirrors the P2P split between `stages.approve_stage()` (shared core) and its
thin HTTP wrappers in `api/v1/*.py`.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from . import field_mapping
from .contract_recommendation import build_recommendation
from .fixtures import get_dp_loader
from .store import (
    dp_contract_recommendations,
    dp_contract_runs,
    dp_field_acknowledgement_memory,
    dp_invoice_runs,
)

# A posted/rejected invoice is final — nothing should mutate its contract
# match or extracted data after this. Rejecting straight from the Extraction
# stage (before any contract was ever matched) is the case that most needs
# this guard: without it, simply opening the Matching page afterwards would
# trigger a fresh AI contract match on an already-decided invoice.
#
# Status vocabulary mirrors Invoice Processing's real pipeline exactly:
# extraction -> extracted -> matching -> bill_posting -> posted, with
# "rejected" a possible exit from matching or bill_posting. There is no
# separate "accepted"/"validated" terminal status — Matching's approval
# moves the invoice on to Bill Posting, same as P2P's metadata_validation/
# line_item_matching approval moves it to bill_posting rather than ending
# the pipeline there.
TERMINAL_STATUSES = ("posted", "rejected")


class NotFoundError(Exception):
    def __init__(self, message: str):
        self.message = message


class InvalidStateError(Exception):
    """Raised when an action can't apply to the invoice's current status —
    e.g. matching/editing a contract onto an already-decided invoice."""
    def __init__(self, message: str):
        self.message = message


class NeedsConfirmationError(Exception):
    """Raised by review_action when open issues exist and the caller hasn't
    passed force=True — the HTTP layer turns this into a 409; STP treats it
    as a hold signal."""
    message = "This invoice still has open issues. Do you still want to approve it?"


def _now():
    return datetime.now(timezone.utc)


def _merge(base: dict, overlay: Optional[dict]) -> dict:
    merged = dict(base or {})
    if overlay:
        merged.update(overlay)
    return merged


def _normalize_for_memory(v) -> str:
    return str(v).strip().lower() if v is not None else ""


def _values_equal(a, b) -> bool:
    return ("" if a is None else str(a)) == ("" if b is None else str(b))


def _diff_extracted_patch(current: dict, patch: dict, user_email: str) -> list[dict]:
    """Build edit_history entries for a metadata/line_items patch, diffing
    against the current merged (base + prior edits) extracted state — same
    "old value is whatever was actually in effect before this edit" semantics
    as P2P's extraction/edit endpoint. No-op edits (old == new) are skipped,
    mirroring P2P exactly."""
    now = _now()
    entries: list[dict] = []
    for key, new_value in patch.items():
        if key == "line_items":
            old_items = current.get("line_items") or []
            new_items = new_value or []
            for idx in range(max(len(old_items), len(new_items))):
                old_item = old_items[idx] if idx < len(old_items) else {}
                new_item = new_items[idx] if idx < len(new_items) else {}
                for f in sorted(set(old_item) | set(new_item)):
                    old_v, new_v = old_item.get(f), new_item.get(f)
                    if _values_equal(old_v, new_v):
                        continue
                    entries.append({
                        "timestamp": now, "user_email": user_email, "scope": "line_item",
                        "field": f, "row_id": str(idx),
                        "old_value": None if old_v is None else str(old_v),
                        "new_value": None if new_v is None else str(new_v),
                    })
            continue
        old_v = current.get(key)
        if _values_equal(old_v, new_value):
            continue
        entries.append({
            "timestamp": now, "user_email": user_email, "scope": "metadata",
            "field": key, "row_id": None,
            "old_value": None if old_v is None else str(old_v),
            "new_value": None if new_value is None else str(new_value),
        })
    return entries


async def _apply_extracted_patch(db, oid: ObjectId, doc: dict, extracted_patch: Optional[dict], user_email: str) -> dict:
    """Shared by edit_invoice/confirm_extraction: diffs the patch against the
    currently-effective extracted state, merges it into edited_extracted, and
    appends any resulting edit_history entries — one write, always in sync."""
    current = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    entries = _diff_extracted_patch(current, extracted_patch or {}, user_email)
    edited = _merge(doc.get("edited_extracted") or {}, extracted_patch)

    mongo_update: dict = {"$set": {"edited_extracted": edited, "updated_at": _now()}}
    if entries:
        mongo_update["$push"] = {"edit_history": {"$each": entries}}
    await dp_invoice_runs(db).update_one({"_id": oid}, mongo_update)

    # Re-fetch rather than hand-mutate the passed-in `doc`: the in-memory DB
    # returns live references, so `doc` may already reflect this update by
    # the time update_one returns — re-fetching is correct either way and
    # doesn't depend on that implementation detail.
    return await get_invoice_doc(db, oid)


# ── Serialization ────────────────────────────────────────────────────────────

def contract_out(doc: dict) -> dict:
    fields = _merge(doc.get("base_fields", {}), doc.get("edited_fields"))
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    return {
        "id": str(doc["_id"]),
        "fixture_key": doc.get("fixture_key"),
        "file_name": doc.get("file_name"),
        "status": doc.get("status"),
        "fields": fields,
        # Per-field label/section/mandatory/audit-trail/AI-match-reasoning —
        # static extraction metadata from the fixture, never touched by edits
        # (only the values in `fields` above change when a user edits).
        "field_meta": bundle.contract_field_meta if bundle else {},
        "pdf_url": f"/dp-api/contracts/{doc['_id']}/pdf",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _format_finding_invoice_value(field: str, value, currency: Optional[str]) -> str:
    if field in ("tax_rate", "wht_rate"):
        try:
            return f"{float(value) * 100:.1f}%"
        except (TypeError, ValueError):
            return str(value)
    if field in ("subtotal", "tax_total", "wht_total", "grand_total"):
        try:
            amount = f"{float(value):,.2f}"
        except (TypeError, ValueError):
            return str(value)
        return f"{currency} {amount}" if currency else amount
    return str(value)


def _refresh_findings_from_extracted(findings: list[dict], extracted: dict) -> list[dict]:
    """Mirrors P2P's own metadata_validation recompute (overlay the latest
    edit_history value onto the fixture's static comparison row on every
    GET): the invoice-side "found" value always reflects the CURRENT
    extracted data, not whatever was in effect when the match first ran."""
    if not findings:
        return findings
    currency = extracted.get("currency")
    refreshed = []
    for f in findings:
        field = f.get("field")
        if not field or extracted.get(field) is None:
            refreshed.append(f)
            continue
        refreshed.append({**f, "found": _format_finding_invoice_value(field, extracted[field], currency)})
    return refreshed


def _is_finding_resolved(f: dict, extracted: dict) -> bool:
    """Same "resolved" definition the frontend's isFindingResolved uses: the
    field's current live value already equals the contract's expected
    value — e.g. after a manual edit, or because it always matched.

    A finding with no `expected_value` at all (a core cross-validation field
    with no literal contract-side figure to compare against, e.g. Tax
    Amount — see field_mapping.CORE_CROSS_VALIDATION_FIELDS) has nothing to
    reconcile and so can never be "a mismatch" — it counts as resolved."""
    field = f.get("field")
    if not field:
        return False
    if f.get("expected_value") is None:
        return True
    current = extracted.get(field)
    if current is None:
        return False
    return str(current) == str(f["expected_value"])


async def _apply_mandatory_field_coverage(db, doc: dict, findings: list[dict], extracted: dict) -> list[dict]:
    """The Matching page always shows a fixed, product-defined checklist of
    cross-validation fields (field_mapping.CORE_CROSS_VALIDATION_FIELDS) —
    Vendor Name, Bank Details, Store Location, Billing/Service Period, and
    the four key amounts — regardless of what matching.json's fixture
    happens to author findings for.

    1. An existing real finding (e.g. matching.json's Subtotal mismatch)
       for a checklist field is tagged `mandatory` per the checklist and
       otherwise left as-is — its richer fixture title/detail survives.
    2. Any checklist field the fixture didn't already flag gets a row
       synthesized here from the invoice's live value vs. the matched
       contract's, so a field that simply matches still shows up (as an
       ordinary matched row) instead of only ever appearing when something's
       wrong. Fields with no contract counterpart at all (the three amount
       fields, which are computed, not literal contract data) still get a
       row — just with nothing to reconcile against (never a mismatch, see
       _is_finding_resolved).
    """
    contract_fields: dict = {}
    contract_id = doc.get("contract_id")
    if contract_id:
        contract_doc = await dp_contract_runs(db).find_one({"_id": contract_id})
        if contract_doc:
            contract_fields = _merge(contract_doc.get("base_fields") or {}, contract_doc.get("edited_fields"))

    core_by_field = {c.invoice_field: c for c in field_mapping.CORE_CROSS_VALIDATION_FIELDS}

    annotated = []
    covered_invoice_fields: set[str] = set()
    for f in findings:
        invoice_field = f.get("field") or ""
        covered_invoice_fields.add(invoice_field)
        core = core_by_field.get(invoice_field)
        # `core` = "belongs on the Matching page's always-shown checklist"
        # (drives display); `mandatory` = "can block approval" — Bank
        # Details is core but NOT mandatory, so these can't be collapsed
        # into one flag.
        annotated.append({**f, "core": bool(core), "mandatory": bool(core and core.mandatory)})

    currency = extracted.get("currency")
    for core in field_mapping.CORE_CROSS_VALIDATION_FIELDS:
        if core.invoice_field in covered_invoice_fields:
            continue
        contract_value = contract_fields.get(core.contract_field) if core.contract_field else None
        invoice_value = extracted.get(core.invoice_field)
        # Always shown, even with nothing on either side (e.g. WHT is
        # genuinely null when no withholding tax applies) — a blank row is
        # itself the answer ("no WHT on this invoice"), not something to hide.
        annotated.append({
            "finding_id": f"CORE-{core.invoice_field}",
            "severity": "error" if core.mandatory else "info",
            "title": f"{core.label} comparison",
            "detail": f"Compares the invoice's {core.label} against the contract.",
            "expected": str(contract_value) if contract_value is not None else None,
            "found": _format_finding_invoice_value(core.invoice_field, invoice_value, currency)
                if invoice_value is not None else None,
            "field": core.invoice_field,
            "expected_value": contract_value,
            "core": True,
            "mandatory": core.mandatory,
        })
    return annotated


async def invoice_out(db, doc: dict) -> dict:
    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    match_result = doc.get("match_result")
    findings = _refresh_findings_from_extracted((match_result or {}).get("findings") or [], extracted)
    findings = await _apply_mandatory_field_coverage(db, doc, findings, extracted)
    system_acknowledged = await _apply_dp_ack_memory(db, findings, extracted)
    return {
        "id": str(doc["_id"]),
        "fixture_key": doc.get("fixture_key"),
        "file_name": doc.get("file_name"),
        "status": doc.get("status"),
        "contract_id": str(doc["contract_id"]) if doc.get("contract_id") else None,
        "extracted": extracted,
        "expected": (match_result or {}).get("expected"),
        "summary": (match_result or {}).get("summary"),
        "findings": findings,
        "original_findings": doc.get("original_findings"),
        "acknowledged_findings": doc.get("acknowledged_findings", []),
        "system_acknowledged_findings": system_acknowledged,
        "has_edit_history": bool(doc.get("edit_history")),
        "tag": doc.get("tag"),
        "notify_email": (doc.get("source_meta") or {}).get("sender"),
        "stp_state": doc.get("stp_state"),
        "stp_failure_reason": doc.get("stp_failure_reason"),
        "review": doc.get("review"),
        "pdf_url": f"/dp-api/invoices/{doc['_id']}/pdf",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def has_open_issues(findings: list[dict], acknowledged: list[str], system_acknowledged: list[str], extracted: dict) -> bool:
    """Only MANDATORY findings (see _apply_mandatory_field_coverage) can
    block approval — a non-mandatory mismatch (e.g. tax_rate, which has no
    literal contract counterpart) is informational only and never needs an
    explicit Acknowledge to get past. `findings` must already carry the
    `mandatory` flag (i.e. be the output of _apply_mandatory_field_coverage).

    A mandatory finding whose live value already matches the contract's
    (`_is_finding_resolved`) is never open either — this matters now that
    synthesized "this mandatory field already matches" rows exist
    (see _apply_mandatory_field_coverage) and are never explicitly
    acknowledged, only ever resolved by already being equal."""
    handled = set(acknowledged) | set(system_acknowledged)
    for f in findings:
        if not f.get("mandatory") or f.get("finding_id") in handled:
            continue
        if _is_finding_resolved(f, extracted):
            continue
        return True
    return False


# ── Contracts ──────────────────────────────────────────────────────────────────

async def upload_contract(db, filename: str) -> dict:
    bundle = get_dp_loader().resolve(filename or "")
    if bundle is None:
        raise NotFoundError("No DirectPay fixture scenarios configured")

    now = _now()
    doc = {
        "fixture_key": bundle.key,
        "file_name": filename,
        "status": "review",
        "base_fields": bundle.contract_extraction,
        "edited_fields": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await dp_contract_runs(db).insert_one(doc)
    doc["_id"] = result.inserted_id
    return contract_out(doc)


async def list_contracts(db) -> list[dict]:
    cursor = dp_contract_runs(db).find({}).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    return [contract_out(d) for d in docs]


async def get_contract(db, oid: ObjectId) -> dict:
    doc = await dp_contract_runs(db).find_one({"_id": oid})
    if not doc:
        raise NotFoundError("Contract not found")
    return contract_out(doc)


async def get_contract_doc(db, oid: ObjectId) -> dict:
    doc = await dp_contract_runs(db).find_one({"_id": oid})
    if not doc:
        raise NotFoundError("Contract not found")
    return doc


async def edit_contract(db, oid: ObjectId, fields: dict) -> dict:
    doc = await get_contract_doc(db, oid)
    edited = _merge(doc.get("edited_fields") or {}, fields)
    await dp_contract_runs(db).update_one(
        {"_id": oid}, {"$set": {"edited_fields": edited, "updated_at": _now()}}
    )
    doc["edited_fields"] = edited
    return contract_out(doc)


async def approve_contract(db, oid: ObjectId, fields: Optional[dict]) -> dict:
    doc = await get_contract_doc(db, oid)
    edited = doc.get("edited_fields") or {}
    if fields:
        edited = _merge(edited, fields)
    await dp_contract_runs(db).update_one(
        {"_id": oid},
        {"$set": {"edited_fields": edited, "status": "saved", "updated_at": _now()}},
    )
    doc["edited_fields"] = edited
    doc["status"] = "saved"
    return contract_out(doc)


# ── Invoices ───────────────────────────────────────────────────────────────────

async def get_invoice_doc(db, oid: ObjectId) -> dict:
    doc = await dp_invoice_runs(db).find_one({"_id": oid})
    if not doc:
        raise NotFoundError("Invoice not found")
    return doc


async def upload_invoice(
    db, filename: str, email: Optional[str] = None, tag: Optional[str] = None
) -> dict:
    bundle = get_dp_loader().resolve(filename or "")
    if bundle is None:
        raise NotFoundError("No DirectPay fixture scenarios configured")

    now = _now()
    doc = {
        "fixture_key": bundle.key,
        "file_name": filename,
        "status": "extraction",  # idle — matches kopi-demo: extraction hasn't run until /extract
        "base_extracted": None,
        "edited_extracted": None,
        "contract_id": None,
        "match_result": None,
        "original_findings": None,
        "acknowledged_findings": [],
        "edit_history": [],
        "stp_state": None,
        "bill_posting_overrides": {},
        "erp": None,
        "review": {"status": "pending", "updated_at": now},
        # Notification/tag metadata — same shape as P2P's pipeline_runs.tag /
        # source_meta.sender, carried through for parity with its own
        # ingestion/trigger-upload request even though DirectPay's own UI
        # doesn't yet surface either.
        "tag": tag,
        "source_meta": {"sender": email} if email else {},
        "created_at": now,
        "updated_at": now,
    }
    result = await dp_invoice_runs(db).insert_one(doc)
    doc["_id"] = result.inserted_id
    return await invoice_out(db, doc)


async def list_invoices(db) -> list[dict]:
    cursor = dp_invoice_runs(db).find({}).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    return [await invoice_out(db, d) for d in docs]


async def extract_invoice(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    extracted = bundle.invoice_extraction if bundle else {}

    await dp_invoice_runs(db).update_one(
        {"_id": oid},
        {"$set": {"base_extracted": extracted, "status": "extracted", "updated_at": _now()}},
    )
    doc["base_extracted"] = extracted
    doc["status"] = "extracted"
    return await invoice_out(db, doc)


async def edit_invoice(db, oid: ObjectId, extracted_patch: Optional[dict], user_email: str = "unknown") -> dict:
    doc = await get_invoice_doc(db, oid)
    doc = await _apply_extracted_patch(db, oid, doc, extracted_patch, user_email)
    return await invoice_out(db, doc)


async def confirm_extraction(db, oid: ObjectId, extracted_patch: Optional[dict], user_email: str = "unknown") -> dict:
    doc = await get_invoice_doc(db, oid)
    doc = await _apply_extracted_patch(db, oid, doc, extracted_patch, user_email)
    return await invoice_out(db, doc)


async def get_edit_history(db, oid: ObjectId) -> list[dict]:
    doc = await get_invoice_doc(db, oid)
    entries = list(doc.get("edit_history") or [])

    def _iso(v):
        return v.isoformat() if hasattr(v, "isoformat") else v

    out = [{**e, "timestamp": _iso(e.get("timestamp"))} for e in entries]
    out.sort(key=lambda e: e["timestamp"], reverse=True)
    return out


async def match_invoice(db, oid: ObjectId, contract_oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") in TERMINAL_STATUSES:
        raise InvalidStateError("This invoice has already been decided and can no longer be matched")
    contract_doc = await dp_contract_runs(db).find_one({"_id": contract_oid})
    if not contract_doc:
        raise NotFoundError("Contract not found")

    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    match_result = bundle.matching if bundle else {"expected": {}, "summary": {}, "findings": []}

    update = {
        "contract_id": contract_oid,
        "match_result": match_result,
        "status": "matching",
        "acknowledged_findings": [],
        "review": {"status": "pending", "updated_at": _now()},
        "updated_at": _now(),
    }
    # Keep a first-pass snapshot of findings, same behaviour observed live in
    # kopi-demo when the matched contract is changed after an initial match.
    if not doc.get("original_findings"):
        update["original_findings"] = match_result.get("findings")

    await dp_invoice_runs(db).update_one({"_id": oid}, {"$set": update})
    doc.update(update)
    return await invoice_out(db, doc)


async def acknowledge_finding(db, oid: ObjectId, finding_id: str, acknowledged: bool) -> list[str]:
    doc = await get_invoice_doc(db, oid)
    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    # Must look this up through the same coverage pass invoice_out()/
    # review_action() use — a CORE-* id (a checklist field the fixture
    # didn't already author a finding for) only ever exists as a synthesized
    # row, never in match_result.findings itself, so searching that raw list
    # alone would 404 on every core-checklist field.
    raw_findings = (doc.get("match_result") or {}).get("findings") or []
    findings = await _apply_mandatory_field_coverage(db, doc, raw_findings, extracted)
    finding = next((f for f in findings if f.get("finding_id") == finding_id), None)
    if not finding:
        raise NotFoundError("Finding not found")

    # Every finding is acknowledgeable regardless of severity, mirroring P2P's
    # MetadataTab: the Acknowledge button is exactly how a mandatory-field
    # mismatch gets unblocked there too — there's no "some fields can never
    # be acknowledged" rule on the P2P side to mirror.
    acked = list(doc.get("acknowledged_findings") or [])
    if acknowledged and finding_id not in acked:
        acked.append(finding_id)
    elif not acknowledged and finding_id in acked:
        acked.remove(finding_id)

    await dp_invoice_runs(db).update_one(
        {"_id": oid}, {"$set": {"acknowledged_findings": acked, "updated_at": _now()}}
    )

    # Learn this (field, contract-value) -> invoice-value pair so future
    # invoices with the same pair can be auto-acknowledged once the
    # DirectPay Acknowledge Threshold is cleared. Only on a fresh manual ACK
    # (not on revert), and only for findings with a resolvable field mapping.
    if acknowledged and finding.get("field") and finding.get("expected_value") is not None:
        await record_dp_acknowledgement(
            db, finding["field"], finding["expected_value"], extracted.get(finding["field"])
        )

    return acked


async def review_action(db, oid: ObjectId, action: str, force: bool, reason: Optional[str]) -> dict:
    """Matching-stage decision. There is no "accept"/"validate" split and no
    "validated" terminal status — approving here is a mid-pipeline transition
    (matching -> bill_posting), same as P2P's line_item_matching approval
    moves the invoice on to bill_posting rather than ending the pipeline."""
    doc = await get_invoice_doc(db, oid)
    if action not in ("approve", "reject"):
        raise ValueError("Invalid action")

    if action == "reject":
        review = {"status": "rejected", "reason": reason, "updated_at": _now()}
        await dp_invoice_runs(db).update_one(
            {"_id": oid}, {"$set": {"status": "rejected", "review": review, "updated_at": _now()}}
        )
        return {"ok": True, "review": review}

    if doc.get("status") != "matching":
        raise InvalidStateError("This invoice is not at the Matching stage")

    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    match_result = doc.get("match_result")
    findings = (match_result or {}).get("findings") or []
    findings = await _apply_mandatory_field_coverage(db, doc, findings, extracted)
    system_acknowledged = await _apply_dp_ack_memory(db, findings, extracted)
    acknowledged = doc.get("acknowledged_findings") or []
    open_issues = has_open_issues(findings, acknowledged, system_acknowledged, extracted)
    if open_issues and not force:
        raise NeedsConfirmationError()

    review = {
        "status": "approved",
        "accepted_with_issues": open_issues,
        "updated_at": _now(),
    }
    await dp_invoice_runs(db).update_one(
        {"_id": oid}, {"$set": {"status": "bill_posting", "review": review, "updated_at": _now()}}
    )
    return {"ok": True, "review": review}


# ── Bill Posting ───────────────────────────────────────────────────────────────
# Mirrors P2P's bill-posting.tsx exactly in shape (editable ERP-coding grid
# pre-post, static summary post-post, same single-route conditional-render
# pattern) but the "Post to ERP" side effect is entirely mocked — DirectPay
# never calls a real Zoho/QuickBooks Desktop API.

def _bill_posting_out(doc: dict) -> dict:
    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    defaults = (bundle.bill_posting if bundle else {}) or {}
    default_items = defaults.get("line_items") or []
    overrides = doc.get("bill_posting_overrides") or {}

    line_items = []
    for idx, item in enumerate(extracted.get("line_items") or []):
        row_id = str(idx)
        item_defaults = default_items[idx] if idx < len(default_items) else {}
        row_overrides = overrides.get(row_id) or {}
        line_items.append({
            "id": row_id,
            "description": item.get("description"),
            "charge_type": item.get("charge_type") or item_defaults.get("charge_type"),
            "quantity": item.get("quantity"),
            "amount": item.get("amount"),
            "gl_account_code": row_overrides.get("gl_account_code", item_defaults.get("gl_account_code", "")),
            "vat_tax_code": row_overrides.get("vat_tax_code", item_defaults.get("vat_tax_code", "")),
            "wht_tax_code": row_overrides.get("wht_tax_code", item_defaults.get("wht_tax_code", "")),
        })

    return {
        "id": str(doc["_id"]),
        "status": doc.get("status"),
        "contract_id": str(doc["contract_id"]) if doc.get("contract_id") else None,
        "vendor_name": extracted.get("vendor_name"),
        "invoice_number": extracted.get("invoice_number"),
        "invoice_date": extracted.get("invoice_date"),
        "currency": extracted.get("currency"),
        "subtotal": extracted.get("subtotal"),
        "tax_amount": extracted.get("tax_total"),
        "wht_amount": extracted.get("wht_total"),
        "grand_total": extracted.get("grand_total"),
        "wht_applicable": defaults.get("wht_applicable", False),
        "line_items": line_items,
        "erp": doc.get("erp"),
        "updated_at": doc.get("updated_at"),
    }


async def get_bill_posting(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") not in ("bill_posting", "posted"):
        raise InvalidStateError("This invoice has not reached the Bill Posting stage")
    return _bill_posting_out(doc)


async def edit_bill_posting(db, oid: ObjectId, line_item_overrides: dict) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") != "bill_posting":
        raise InvalidStateError("This invoice is not at the Bill Posting stage")

    overrides = dict(doc.get("bill_posting_overrides") or {})
    for row_id, patch in (line_item_overrides or {}).items():
        overrides[row_id] = _merge(overrides.get(row_id) or {}, patch)

    await dp_invoice_runs(db).update_one(
        {"_id": oid}, {"$set": {"bill_posting_overrides": overrides, "updated_at": _now()}}
    )
    return await get_bill_posting(db, oid)


async def post_bill(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") != "bill_posting":
        raise InvalidStateError("This invoice is not at the Bill Posting stage")

    now = _now()
    erp = {
        "bill_number": f"DP-BILL-{str(oid)[-6:].upper()}",
        "posted_at": now,
    }
    review = {"status": "posted", "updated_at": now}
    await dp_invoice_runs(db).update_one(
        {"_id": oid},
        {"$set": {"status": "posted", "erp": erp, "review": review, "updated_at": now}},
    )
    result = await get_bill_posting(db, oid)
    await _notify_dp_bill_posted(db, doc, erp)
    return result


async def _resolve_dp_notification_email(db, doc: dict, extracted: dict) -> Optional[str]:
    """Three equivalent ways to land on "the vendor's email", in order of
    how explicit/authoritative they are:
      1. Explicitly given at upload time (/ingestion/trigger-upload's
         `email` field) — an operator said "notify this address", so it wins.
      2. The vendor's own email as extracted from the invoice itself.
      3. The vendor's own email as extracted from the matched contract —
         falls back here only if the invoice's own extraction didn't have it.
    """
    explicit = (doc.get("source_meta") or {}).get("sender")
    if explicit:
        return explicit
    if extracted.get("vendor_email"):
        return extracted["vendor_email"]
    contract_id = doc.get("contract_id")
    if contract_id:
        contract_doc = await dp_contract_runs(db).find_one({"_id": contract_id})
        if contract_doc:
            contract_fields = _merge(contract_doc.get("base_fields") or {}, contract_doc.get("edited_fields"))
            if contract_fields.get("vendor_email"):
                return contract_fields["vendor_email"]
    return None


async def _notify_dp_bill_posted(db, doc: dict, erp: dict) -> None:
    """Mirrors P2P's own post_bill_to_erp notification (see
    backend/src/api/v1/bill_posting.py): fire-and-forget an email once
    bill-posting completes. Unlike P2P (whose only source is the upload-time
    sender address), DirectPay also has a real vendor email available from
    extraction — see _resolve_dp_notification_email for the full priority
    order. Any Gmail/config failure is caught and logged, never surfaced to
    the caller, since a mocked ERP-post should still succeed."""
    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    recipient = await _resolve_dp_notification_email(db, doc, extracted)
    if not recipient:
        return
    try:
        from ..services import gmail_client
        from ..services.email_templates import directpay_posted_html

        currency = extracted.get("currency") or ""
        total = extracted.get("grand_total")
        total_fmt = f"{float(total):,.2f}" if total is not None else "—"
        html = directpay_posted_html(
            invoice_number=erp["bill_number"],
            vendor_name=extracted.get("vendor_name") or "",
            currency=currency,
            total_amount=total_fmt,
            posted_date=erp["posted_at"].strftime("%d %b %Y"),
        )
        await gmail_client.send_html_email(
            to=recipient,
            subject=f"Invoice {erp['bill_number']} Posted Successfully",
            html_body=html,
        )
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            "DirectPay bill posting notification email failed to %s", recipient
        )


# ── Simulate (debit/credit journal preview) ───────────────────────────────────
# Mirrors P2P's POST .../bill_posting/simulate function-for-function (see
# backend/src/api/v1/bill_posting.py's _build_simulate_document /
# simulate_bill_posting) — that endpoint has no real n8n call either ("This
# demo has no n8n, so we synthesize the same FE-ready contract... directly
# from the bill-posting fixture"), so this is the same kind of synthesis,
# built from the invoice's own extracted totals instead of a fixture-supplied
# bill_header (DirectPay has no separate bill_header — the underlying invoice
# extraction already carries subtotal/tax_total/wht_total/grand_total).
#
# Scoped adaptation: P2P's WHT-code enforcement (required_wht_code) validates
# against Philippine BIR SAP codes, which have no analog for an Indonesian
# PPN lease invoice — that half of P2P's enforcement isn't replicated here.
# The VAT-code enforcement (required_vat_code) IS replicated, since DirectPay's
# vat_tax_code values are real and meaningful (e.g. "PPN11").

_COUNTRY_BY_CCY = {
    "INR": "IN", "PHP": "PH", "USD": "US", "EUR": "DE",
    "GBP": "GB", "MYR": "MY", "IDR": "ID", "JPY": "JP",
}


async def simulate_bill_posting(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") not in ("bill_posting", "posted"):
        raise InvalidStateError("This invoice has not reached the Bill Posting stage")

    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    defaults = (bundle.bill_posting if bundle else {}) or {}
    bp = _bill_posting_out(doc)

    currency = bp.get("currency") or "IDR"
    vendor_name = bp.get("vendor_name") or "Vendor"
    bill_number = bp.get("invoice_number") or ""
    subtotal = float(bp.get("subtotal") or 0)
    tax_amount = float(bp.get("tax_amount") or 0)
    grand_total = float(bp.get("grand_total") or (subtotal + tax_amount))
    wht_amount = float(bp.get("wht_amount") or 0) if bp.get("wht_applicable") else 0.0
    net_payable = grand_total - wht_amount
    line_items = bp.get("line_items") or []
    # The invoice's own extracted tax rate (e.g. 0.11) — labels the Input VAT
    # row with a percentage, mirroring P2P's vat_codes.json percentage lookup.
    # DirectPay has the real rate on the invoice itself, so no lookup table
    # is needed the way P2P's SAP-code system requires one.
    tax_rate = extracted.get("tax_rate")

    headers = [
        {"id": "position", "label": "#", "type": "text", "width": 56},
        {"id": "posting_key", "label": "Posting Key", "type": "text", "width": 120},
        {"id": "account", "label": "G/L Account", "type": "text", "width": 260},
        {"id": "description", "label": "Description", "type": "text", "width": 280},
        {"id": "tax_code", "label": "Tax Code", "type": "text", "width": 100},
        {"id": "debit", "label": "Debit", "type": "number", "width": 140, "align": "right"},
        {"id": "credit", "label": "Credit", "type": "number", "width": 140, "align": "right"},
    ]

    rows: list[dict] = []
    pos = 1

    for it in line_items:
        rows.append({
            "position": pos,
            "posting_key": "40 · Debit",
            "account": f"{it.get('gl_account_code') or '5000'} · {it.get('charge_type') or 'Expense'}",
            "description": it.get("description") or it.get("charge_type") or "Line item",
            "tax_code": it.get("vat_tax_code") or "—",
            "debit": round(float(it.get("amount") or 0), 2),
            "credit": 0,
            "is_visible": True,
        })
        pos += 1

    # Input tax debit — shown for ANY invoice with a VAT code set, including a
    # 0% rate (mirrors P2P exactly: gated on the code being present, not on
    # tax_amount > 0).
    input_vat_code = next((it.get("vat_tax_code") for it in line_items if it.get("vat_tax_code")), "—")
    if any(it.get("vat_tax_code") for it in line_items):
        vat_pct = f"{tax_rate * 100:.0f}%" if tax_rate else ""
        input_vat_desc = f"Input tax · {vat_pct}" if vat_pct else "Input tax"
        rows.append({
            "position": pos,
            "posting_key": "40 · Debit",
            "account": "1170 · Input VAT (recoverable)",
            "description": input_vat_desc,
            "tax_code": input_vat_code,
            "debit": round(tax_amount, 2),
            "credit": 0,
            "is_visible": True,
        })
        pos += 1

    wht_code = next((it.get("wht_tax_code") for it in line_items if it.get("wht_tax_code")), "—")
    if wht_amount > 0:
        wht_pct = f"{(wht_amount / subtotal * 100):.0f}%" if subtotal else ""
        wht_desc = f"WHT deduction at source · {wht_pct}" if wht_pct else "WHT deduction at source"
        rows.append({
            "position": pos,
            "posting_key": "50 · Credit",
            "account": "2230 · Withholding Tax Payable",
            "description": wht_desc,
            "tax_code": wht_code,
            "debit": 0,
            "credit": round(wht_amount, 2),
            "is_visible": True,
        })
        pos += 1

    rows.append({
        "position": pos,
        "posting_key": "31 · Credit",
        "account": f"AP · {vendor_name}",
        "description": f"Vendor invoice {bill_number}".strip(),
        "tax_code": "—",
        "debit": 0,
        "credit": round(net_payable, 2),
        "is_visible": True,
    })

    debit_total = round(sum(r["debit"] for r in rows), 2)
    credit_total = round(sum(r["credit"] for r in rows), 2)
    balance = round(debit_total - credit_total, 2)

    document = {
        "headers": headers,
        "rows": rows,
        "totals": {"debit": debit_total, "credit": credit_total, "balance": balance},
        "meta": {
            "run_id": str(oid),
            "bill_number": bill_number,
            "currency": currency,
            "country_code": _COUNTRY_BY_CCY.get(currency.upper(), ""),
            "line_item_count": len(line_items),
            "calculated_at": _now().isoformat(),
        },
    }

    balanced = abs(balance) < 0.01
    if balanced:
        status = "success"
        message = f"Document simulated successfully — the posting is balanced (Debit = Credit = {debit_total:,.2f} {currency})."
    else:
        status = "error"
        message = f"Simulation failed — the document is not balanced (difference {balance:,.2f} {currency})."

    # VAT code enforcement — mirrors P2P's fixture-driven required_vat_code
    # check exactly, sourced from the bill_posting fixture's own defaults.
    required_vat_code = defaults.get("required_vat_code")
    if required_vat_code and status == "success":
        invalid_codes = [
            it.get("vat_tax_code")
            for it in line_items
            if it.get("vat_tax_code") and it.get("vat_tax_code") != required_vat_code
        ]
        if invalid_codes:
            status = "error"
            message = (
                f"Simulation failed — invalid VAT/GST Tax Code '{invalid_codes[0]}' on line item. "
                f"This invoice requires '{required_vat_code}'."
            )

    return {"status": status, "message": message, "document": document}


# ── Acknowledge-Threshold learned memory (DirectPay-scoped) ──────────────────
# Isolated from P2P's field_acknowledgement_memory — see store.py's docstring.
# Only warning/info findings ever participate: errors can never be manually
# acknowledged (existing rule), so they never accumulate a count and are
# always excluded from auto-acknowledgement here too.

async def record_dp_acknowledgement(db, field_name: str, source_value, found_value) -> None:
    source_norm = _normalize_for_memory(source_value)
    if not source_norm:
        return
    found_norm = _normalize_for_memory(found_value)
    now = _now()
    coll = dp_field_acknowledgement_memory(db)
    existing = await coll.find_one({"field_name": field_name, "source_value": source_norm})
    if existing:
        counts = list(existing.get("acknowledgement_counts") or [])
        for entry in counts:
            if entry.get("v") == found_norm:
                entry["c"] = entry.get("c", 0) + 1
                break
        else:
            counts.append({"v": found_norm, "c": 1})
        await coll.update_one(
            {"_id": existing["_id"]},
            {"$set": {"acknowledgement_counts": counts, "last_acknowledged_at": now, "updated_at": now}},
        )
    else:
        await coll.insert_one({
            "field_name": field_name,
            "source_value": source_norm,
            "acknowledgement_counts": [{"v": found_norm, "c": 1}],
            "last_acknowledged_at": now,
            "created_at": now,
            "updated_at": now,
        })


async def _apply_dp_ack_memory(db, findings: list[dict], extracted: dict) -> list[str]:
    """Return finding_ids that are pre-blessed by learned memory (field,
    contract-value, current-invoice-value) — uses the LIVE extracted value so
    this stays correct across edits/reloads, same reasoning as the "resolved
    via copy" check on the frontend."""
    if not findings:
        return []
    from .stp import get_dp_ack_threshold  # local import — stp.py never imports service.py's endpoints back
    threshold = await get_dp_ack_threshold(db)
    coll = dp_field_acknowledgement_memory(db)
    system_ids: list[str] = []
    for f in findings:
        if f.get("severity") == "error":
            continue
        field = f.get("field")
        if not field or f.get("expected_value") is None:
            continue
        source_norm = _normalize_for_memory(f.get("expected_value"))
        if not source_norm:
            continue
        found_norm = _normalize_for_memory(extracted.get(field))
        memory_doc = await coll.find_one({"field_name": field, "source_value": source_norm})
        if not memory_doc:
            continue
        count = next(
            (e.get("c", 0) for e in (memory_doc.get("acknowledgement_counts") or []) if e.get("v") == found_norm),
            0,
        )
        if count >= threshold:
            system_ids.append(f["finding_id"])
    return system_ids


# ── AI contract recommendation ────────────────────────────────────────────────
# Mirrors services/po_recommendation.py's lazy-compute-and-cache-then-maybe-
# auto-apply shape. No fixture sidecar persistence here (unlike PO's, which
# needs to survive fixture-scenario replay across DB wipes) — DirectPay's
# in-memory DB already recomputes per invoice run, and contracts/invoices are
# both live, mutable runs rather than static fixture scenarios.

def _public_recommendation(doc: dict) -> dict:
    return {
        "status": doc.get("status"),
        "recommended": doc.get("recommended"),
        "candidates": doc.get("candidates", []),
        "candidates_considered": doc.get("candidates_considered", 0),
        "generated_at": doc.get("generated_at"),
        "applied_at": doc.get("applied_at"),
    }


async def get_contract_recommendation(db, oid: ObjectId) -> dict:
    """Lazily compute (once) the best-matching saved contract for this
    invoice, auto-applying it via the same match_invoice() a human's dropdown
    pick would call when a confident candidate exists. A contract already set
    (by AI or by a human) short-circuits — this never re-picks."""
    doc = await get_invoice_doc(db, oid)

    if doc.get("status") in TERMINAL_STATUSES:
        # Already decided (including rejected straight from Extraction,
        # before ever having a contract) — never retroactively match one.
        return {
            "applicable": False,
            "reason": "invoice_terminal",
            "current_contract_id": str(doc["contract_id"]) if doc.get("contract_id") else None,
        }

    if doc.get("contract_id"):
        # A contract is already set (by this same call earlier, or a human's
        # dropdown pick) — never re-pick. Still surface any cached
        # recommendation doc so the caller can tell whether the CURRENT
        # contract traces back to that AI pick (drives the Matching page's
        # sparkle banner) without re-running the scoring.
        cached = await dp_contract_recommendations(db).find_one({"run_id": oid})
        return {
            "applicable": False,
            "reason": "contract_already_set",
            "current_contract_id": str(doc["contract_id"]),
            **(_public_recommendation(cached) if cached else {}),
        }

    existing = await dp_contract_recommendations(db).find_one({"run_id": oid})
    if existing:
        return {"applicable": True, "current_contract_id": None, **_public_recommendation(existing)}

    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    saved_contracts = [c for c in await list_contracts(db) if c["status"] == "saved"]
    result = build_recommendation(extracted, saved_contracts)

    now = _now()
    applied = result["recommended"] is not None
    if applied:
        await match_invoice(db, oid, ObjectId(result["recommended"]["contract_id"]))

    rec_doc = {
        "run_id": oid,
        "status": "applied" if applied else "no_match",
        "recommended": result["recommended"],
        "candidates": result.get("candidates", []),
        "candidates_considered": result.get("candidates_considered", 0),
        "generated_at": now,
        "applied_at": now if applied else None,
    }
    await dp_contract_recommendations(db).update_one({"run_id": oid}, {"$set": rec_doc}, upsert=True)

    return {
        "applicable": True,
        "current_contract_id": str(result["recommended"]["contract_id"]) if applied else None,
        **_public_recommendation(rec_doc),
    }


async def get_cached_contract_recommendation(db, oid: ObjectId) -> Optional[dict]:
    """Read-only peek at a previously computed recommendation, if any —
    used by STP to check whether a fresh AI pick still needs human review,
    without triggering a new computation."""
    doc = await dp_contract_recommendations(db).find_one({"run_id": oid})
    return doc

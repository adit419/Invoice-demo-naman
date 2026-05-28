from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import executed_stages, pipeline_runs
from ...services.fixtures import get_loader
from ...services.invoice_state import get_invoice_schema
from .stages import approve_stage, reject_stage

router = APIRouter(tags=["line_item_matching"])


from ._common import (
    _envelope,
    _extract_field,
    _oid,
    _require_editor,
    _unwrap_fixture,
)


# Flat per-currency tolerance (mirrors line-item-computation.json "Tolerance
# Config 2" — the absolute amount by which the GRN total may differ from the
# collapsed invoice total before the variance is flagged).
CURRENCY_TOLERANCE = {
    "USD": 1.15, "EUR": 1, "GBP": 0.90, "CHF": 0.90, "CAD": 1.6, "AUD": 1.65,
    "NZD": 0, "SGD": 1.5, "HKD": 9, "JPY": 184, "CNY": 7.9, "INR": 111,
    "MUR": 55, "PHP": 72, "IDR": 20000, "MYR": 4.60, "THB": 38, "VND": 31000,
    "BND": 1.5, "KRW": 1741, "TWD": 37, "MOP": 9.4, "SEK": 11,
}


def _build_matching(invoice_schema: dict, currency: str | None, li_fixture: dict) -> dict:
    """Replicate line-item-computation.json's Collapse Invoice Lines +
    Tolerance Config + Transform Tool Result against fixture data.

    All invoice line items collapse into ONE row (= total_amount_before_vat).
    The granular extraction lines become the matching dataset (GRN side) so
    the variance bar has per-row amounts to add up as the user toggles them.
    """
    metadata = {
        m["field"]: m.get("value")
        for m in invoice_schema.get("metadata", [])
        if "field" in m
    }
    total_raw = metadata.get("total_amount_before_vat")
    if total_raw in (None, "", 0):
        total_raw = metadata.get("total_amount")
    invoice_total = round(float(total_raw or 0), 2)

    line_items = invoice_schema.get("line_items", [])

    description = ", ".join(
        str(li.get("item_description", "")).strip()
        for li in line_items
        if li.get("item_description")
    )
    collapsed_invoice = {
        "id": "1",
        "description": "Total of invoice",
        "quantity": 1,
        "unit_price": invoice_total,
        "line_total": invoice_total,
        "price": invoice_total,
    }

    po_number = (li_fixture.get("po_numbers") or [None])[0]
    # GRN columns mirror invoice-validator-fe's SAP GRN schema
    # (_get_sap_grn_field_mappings): PO No. | GRN No. | Document Date |
    # Description | Quantity | Amount. The demo has no real SAP GRN feed, so
    # GRN No. / Document Date are synthesised deterministically per line.
    doc_date = str(metadata.get("document_date") or metadata.get("invoice_date") or "")
    grn_line_items = []
    for idx, li in enumerate(line_items, start=1):
        amount = round(float(li.get("total_price_before_vat") or 0), 2)
        grn_line_items.append({
            "id": str(li.get("id")),
            "po_number": po_number,
            "grn_number": str(5000000000 + idx),
            "document_date": doc_date,
            "description": li.get("item_description") or "",
            "quantity": li.get("quantity") or 0,
            "amount": amount,
            "line_total": amount,
        })

    grn_ids = [g["id"] for g in grn_line_items]
    grn_sum = round(sum(g["amount"] for g in grn_line_items), 2)

    tolerance = {
        "currency": currency or "USD",
        "value": CURRENCY_TOLERANCE.get((currency or "").upper(), 0),
    }
    # min = invoice total, max = sum of every GRN line (mirrors Transform Tool Result)
    allowed_range = {"min": invoice_total, "max": grn_sum}
    diff = round(invoice_total - grn_sum, 2)
    variance = {
        "value": abs(diff),
        "direction": "positive" if diff >= 0 else "negative",
    }

    results = [{
        "id": 1,
        "invoice_line_ids": ["1"],
        "group_id": "grp-all",
        "match_status": "perfect" if grn_ids else "no_match",
        "result_data": {
            "po": [],
            "grn": grn_ids,
            "confidence": 1 if grn_ids else 0,
        },
        "reasoning": (
            f"Collapsed invoice total {invoice_total:.2f} matched against "
            f"{len(grn_line_items)} GRN line item(s) totalling {grn_sum:.2f} "
            f"(variance {diff:.2f}, tolerance {tolerance['value']})."
        ),
        "matching_method": "ai",
        "matched_by": "ai",
        "matched_at": None,
        "created_at": None,
    }]

    return {
        "summary": {
            "perfect": 1 if grn_ids else 0,
            "no_match": 0 if grn_ids else 1,
            "total_items": 1,
        },
        "match_type": li_fixture.get("match_type", "3-way"),
        "ai_metadata": li_fixture.get("ai_metadata", {}),
        "invoice_line_items": [collapsed_invoice],
        "grn_line_items": grn_line_items,
        "results": results,
        "tolerance": tolerance,
        "allowed_range": allowed_range,
        "variance": variance,
    }


# ── GET /api/v1/invoices/{id}/stages/line_item_matching ───────────────────────

@router.get("/invoices/{invoice_id}/stages/line_item_matching")
async def get_line_item_matching(invoice_id: str, current_user: CurrentUser):
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Live extraction state: fixture extraction.json + replayed edit_history
    invoice_schema = await get_invoice_schema(db, oid)

    loader = get_loader()
    bundles = loader.discover()
    fixture_key = run.get("fixture_key", "")
    bundle = bundles.get(fixture_key)

    li_fixture = bundle.line_item if bundle else {}
    meta_fixture = _unwrap_fixture(bundle.metadata_validation if bundle else {})

    currency = _extract_field(invoice_schema, "currency")
    matching = _build_matching(invoice_schema, currency, li_fixture)

    meta_summary = meta_fixture.get("summary", {})

    stage_doc = await executed_stages(db).find_one({"run_id": oid, "stage_slug": "line_item_matching"}) or {}

    return _envelope(data={
        "invoice_number": _extract_field(invoice_schema, "invoice_number"),
        "invoice_date": _extract_field(invoice_schema, "invoice_date"),
        "vendor_name": _extract_field(invoice_schema, "vendor_name"),
        "currency": currency,
        "po_number": (li_fixture.get("po_numbers") or [None])[0],
        "file_name": run.get("file_name", ""),
        "fixture_key": fixture_key,
        "status": run.get("status", "in_progress"),
        "stage_status": stage_doc.get("status", "in_review"),
        "matching": matching,
        "metadata_fields": meta_fixture.get("fields", []),
        "metadata_summary": meta_summary,
        "document_types": meta_summary.get("document_types", ["invoice", "po"]),
    })


# ── POST .../approve ──────────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/stages/line_item_matching/approve")
async def approve_line_item_matching(invoice_id: str, current_user: CurrentUser):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    result = await approve_stage(
        db, oid,
        slug="line_item_matching",
        current_user=current_user,
        action="line_item_matching.approved",
    )

    next_stage = result["next_stage"]
    redirect = f"/invoice/{invoice_id}/bill-posting" if next_stage else f"/invoice/{invoice_id}"
    return _envelope(data={"next_stage": next_stage, "redirect": redirect})


# ── POST .../reject ───────────────────────────────────────────────────────────

class RejectRequest(BaseModel):
    reason: str


@router.post("/invoices/{invoice_id}/stages/line_item_matching/reject")
async def reject_line_item_matching(
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

    await reject_stage(db, oid, "line_item_matching", current_user, body.reason)

    return _envelope(data={"status": "rejected"})

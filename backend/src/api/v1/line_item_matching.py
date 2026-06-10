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


def _distribute_qty(inv_qty: float, n: int) -> list:
    """Distribute inv_qty across n rows with integer-aware splitting."""
    if n <= 0:
        return []
    if n == 1:
        return [inv_qty]
    # Integer case: use floor+remainder distribution
    if inv_qty == int(inv_qty):
        total = int(inv_qty)
        base = total // n
        rem = total % n
        return [base + (1 if i < rem else 0) for i in range(n)]
    # Float case: even split, last row absorbs rounding
    per = round(inv_qty / n, 4)
    result = [per] * (n - 1)
    result.append(round(inv_qty - per * (n - 1), 4))
    return result


def _build_per_item_matching(
    line_items: list,
    fixture_results: list,
    doc_date: str,
    po_data: dict | None = None,
    grn_data: list | None = None,
) -> list:
    """Build per-invoice-line-item matching data with GRN candidates.

    When po_data/grn_data are provided, GRN candidates use the actual per-size
    PO descriptions, received quantities, and unit prices from those files.
    Falls back to fixture-based qty distribution when no PO/GRN data is found.

    Perfect  → actual PO/GRN rows (or evenly-distributed fallback).
    Probable → actual PO/GRN rows with is_ai_suggested=True (or fallback).
    No match → empty GRN candidates list.
    """
    # Build PO/GRN lookups: item_code → [po_item, ...] and item_id → grn_entry
    code_to_po_items: dict[str, list] = {}
    desc_to_po_items: dict[str, list] = {}
    grn_map: dict[str, dict] = {}
    fixture_po_number: str | None = None

    if po_data:
        fixture_po_number = po_data.get("po_number")
        for po_item in po_data.get("items", []):
            desc = po_item.get("description", "")
            if " - " in desc:
                code = desc.split(" - ")[0].strip()
                code_to_po_items.setdefault(code, []).append(po_item)
            else:
                desc_to_po_items.setdefault(desc.strip().upper(), []).append(po_item)
    if grn_data:
        for entry in grn_data:
            iid = entry.get("item_id")
            if iid:
                grn_map[iid] = entry

    per_item = []
    for idx, li in enumerate(line_items):
        inv_qty = float(li.get("quantity") or 0)
        unit_price = float(li.get("unit_price") or 0)
        inv_total = round(float(li.get("total_price_before_vat") or 0), 2)
        description = li.get("item_description") or ""
        item_code = li.get("item_code") or ""
        li_id = li.get("id", idx + 1)

        result = fixture_results[idx] if idx < len(fixture_results) else None
        fixture_status = (result or {}).get("match_status", "no_match")
        # Map to UI status names
        ui_status = "matched" if fixture_status == "perfect" else fixture_status

        # Resolve PO items: by SKU code first, then by description for non-SKU items.
        # When matched by description, override unit_price/inv_total so the invoice
        # left table shows the PO price (e.g. inclusive-of-tax total from PO).
        matching_po_items = code_to_po_items.get(item_code, [])
        if not matching_po_items and not item_code:
            _desc_po = desc_to_po_items.get(description.strip().upper(), [])
            if _desc_po:
                matching_po_items = _desc_po
                _po_price = float(_desc_po[0].get("unit_price", unit_price))
                unit_price = _po_price
                inv_total = round(inv_qty * _po_price, 2)

        grn_candidates = []

        if result and fixture_status == "perfect":
            if matching_po_items:
                # Use actual per-size PO/GRN data
                for j, po_item in enumerate(matching_po_items):
                    iid = po_item.get("item_id")
                    grn_entry = grn_map.get(iid) if iid else None
                    g_qty = float(grn_entry["received_quantity"]) if grn_entry else float(po_item.get("quantity", 0))
                    po_price = float(po_item.get("unit_price", unit_price))
                    g_total = round(g_qty * po_price, 2)
                    grn_candidates.append({
                        "id": f"{li_id}-grn-{j + 1}",
                        "po_number": fixture_po_number,
                        "grn_number": grn_entry["grn_id"] if grn_entry else f"GRN-{idx + 1}-{j + 1}",
                        "document_date": doc_date,
                        "description": po_item.get("description", description),
                        "quantity": g_qty,
                        "unit_price": po_price,
                        "line_total": g_total,
                        "is_matched": True,
                        "is_ai_suggested": False,
                        "qty_diff": 0,
                        "total_diff": 0,
                    })
            else:
                # Fallback: distribute invoice qty evenly across fixture po/grn refs
                rdata = result.get("result_data") or {}
                matched_ids = rdata.get("matched_row_ids") or []
                po_refs = rdata.get("po") or []
                grn_refs = rdata.get("grn") or []
                n = len(po_refs) or len(grn_refs) or len(matched_ids) or 1
                qtys = _distribute_qty(inv_qty, n)
                for j in range(n):
                    q = qtys[j] if j < len(qtys) else 0
                    total = round(q * unit_price, 2)
                    grn_candidates.append({
                        "id": f"{li_id}-grn-{j + 1}",
                        "po_number": po_refs[j] if j < len(po_refs) else None,
                        "grn_number": grn_refs[j] if j < len(grn_refs) else f"GRN-{matched_ids[j] if j < len(matched_ids) else idx + 1}",
                        "document_date": doc_date,
                        "description": description,
                        "quantity": q,
                        "unit_price": unit_price,
                        "line_total": total,
                        "is_matched": True,
                        "is_ai_suggested": False,
                        "qty_diff": 0,
                        "total_diff": 0,
                    })

        elif result and fixture_status == "probable":
            if matching_po_items:
                # Use actual per-size PO/GRN data with probable flagging
                for j, po_item in enumerate(matching_po_items):
                    iid = po_item.get("item_id")
                    grn_entry = grn_map.get(iid) if iid else None
                    g_qty = float(grn_entry["received_quantity"]) if grn_entry else float(po_item.get("quantity", 0))
                    po_qty = float(po_item.get("quantity", 0))
                    po_price = float(po_item.get("unit_price", unit_price))
                    g_total = round(g_qty * po_price, 2)
                    po_total = round(po_qty * po_price, 2)
                    grn_candidates.append({
                        "id": f"{li_id}-grn-{j + 1}",
                        "po_number": fixture_po_number,
                        "grn_number": grn_entry["grn_id"] if grn_entry else f"GRN-{idx + 1}-{j + 1}",
                        "document_date": doc_date,
                        "description": po_item.get("description", description),
                        "quantity": g_qty,
                        "unit_price": po_price,
                        "line_total": g_total,
                        "is_matched": True,
                        "is_ai_suggested": True,
                        "qty_diff": round(g_qty - po_qty, 4),
                        "total_diff": round(g_total - po_total, 2),
                    })
            else:
                # Fallback: distribute using fixture refs and available_qty
                rdata = result.get("result_data") or {}
                prob_candidates = rdata.get("probable_candidates") or []
                if prob_candidates:
                    best = prob_candidates[0]
                    po_refs = best.get("po") or []
                    grn_refs = best.get("grn") or []
                    available_qty = best.get("available_qty")
                    grn_unit_price = float(best.get("unit_price") or unit_price)
                    per_row_quantities = best.get("quantities")
                else:
                    po_refs = rdata.get("po") or []
                    grn_refs = rdata.get("grn") or []
                    available_qty = None
                    grn_unit_price = unit_price
                    per_row_quantities = None

                n = len(po_refs) if po_refs else len(grn_refs) if grn_refs else 1

                if per_row_quantities and len(per_row_quantities) >= n:
                    grn_qtys = [float(q) for q in per_row_quantities[:n]]
                    grn_total_qty = sum(grn_qtys)
                    inv_qtys = grn_qtys if abs(grn_total_qty - inv_qty) < 0.01 else _distribute_qty(inv_qty, n)
                elif available_qty is not None:
                    grn_total_qty = float(available_qty)
                    grn_qtys = _distribute_qty(grn_total_qty, n)
                    inv_qtys = _distribute_qty(inv_qty, n)
                else:
                    raw = inv_qty * 0.8
                    grn_total_qty = float(int(raw) if raw == int(raw) else round(raw, 4))
                    grn_qtys = _distribute_qty(grn_total_qty, n)
                    inv_qtys = _distribute_qty(inv_qty, n)

                for j in range(n):
                    g_qty = grn_qtys[j] if j < len(grn_qtys) else 0
                    i_qty = inv_qtys[j] if j < len(inv_qtys) else 0
                    g_total = round(g_qty * grn_unit_price, 2)
                    i_total_row = round(i_qty * grn_unit_price, 2)
                    grn_candidates.append({
                        "id": f"{li_id}-grn-{j + 1}",
                        "po_number": po_refs[j] if j < len(po_refs) else None,
                        "grn_number": grn_refs[j] if j < len(grn_refs) else f"GRN-{idx + 1}-{j + 1}",
                        "document_date": doc_date,
                        "description": description,
                        "quantity": g_qty,
                        "unit_price": grn_unit_price,
                        "line_total": g_total,
                        "is_matched": True,
                        "is_ai_suggested": True,
                        "qty_diff": round(g_qty - i_qty, 4),
                        "total_diff": round(g_total - i_total_row, 2),
                    })
        # no_match → grn_candidates stays []

        per_item.append({
            "id": f"ILI-{idx + 1:04d}",
            "item_code": item_code,
            "description": description,
            "quantity": inv_qty,
            "unit_price": unit_price,
            "line_total": inv_total,
            "match_status": ui_status,
            "grn_candidates": grn_candidates,
        })

    return per_item


def _build_matching(invoice_schema: dict, currency: str | None, li_fixture: dict, po_data: dict | None = None, grn_data: list | None = None) -> dict:
    """Build the full matching payload.

    Returns both:
    - per_item_matching  — one entry per invoice line with its own GRN
      candidates, match status, and discrepancy data (drives the new UI).
    - Legacy collapsed-invoice structure (invoice_line_items / grn_line_items /
      results) kept for the variance bar and stage-gating logic.
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
    fixture_results = li_fixture.get("results", [])

    doc_date = str(metadata.get("document_date") or metadata.get("invoice_date") or "")

    # ── Per-item matching (new UI) ─────────────────────────────────────────────
    per_item_matching = _build_per_item_matching(line_items, fixture_results, doc_date, po_data, grn_data)

    # ── Legacy collapsed structure (variance bar / stage gating) ──────────────
    po_number = (li_fixture.get("po_numbers") or [None])[0]
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

    collapsed_invoice = {
        "id": "1",
        "description": "Total of invoice",
        "quantity": 1,
        "unit_price": invoice_total,
        "line_total": invoice_total,
        "price": invoice_total,
    }

    tolerance = {
        "currency": currency or "USD",
        "value": CURRENCY_TOLERANCE.get((currency or "").upper(), 0),
    }
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

    n_matched = sum(1 for r in fixture_results if r.get("match_status") == "perfect")
    n_probable = sum(1 for r in fixture_results if r.get("match_status") == "probable")
    n_no_match = sum(1 for r in fixture_results if r.get("match_status") == "no_match")

    return {
        "summary": {
            "perfect": n_matched,
            "probable": n_probable,
            "no_match": n_no_match,
            "total_items": len(line_items),
        },
        "match_type": li_fixture.get("match_type", "3-way"),
        "ai_metadata": li_fixture.get("ai_metadata", {}),
        "invoice_line_items": [collapsed_invoice],
        "grn_line_items": grn_line_items,
        "results": results,
        "per_item_matching": per_item_matching,
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
    matching = _build_matching(
        invoice_schema, currency, li_fixture,
        po_data=bundle.po_data if bundle else None,
        grn_data=bundle.grn_data if bundle else None,
    )

    meta_summary = meta_fixture.get("summary", {})

    stage_doc = await executed_stages(db).find_one({"run_id": oid, "stage_slug": "line_item_matching"}) or {}

    # Apply any user-confirmed mappings saved via PATCH .../mappings
    confirmed_mappings = stage_doc.get("confirmed_mappings")
    if confirmed_mappings is not None:
        checked_grn_ids = set(confirmed_mappings.get("checked_grn_ids", []))
        confirmed_item_ids = set(confirmed_mappings.get("confirmed_item_ids", []))
        for item in matching["per_item_matching"]:
            if item["id"] in confirmed_item_ids:
                item["match_status"] = "matched"
            for grn in item["grn_candidates"]:
                grn["is_matched"] = grn["id"] in checked_grn_ids

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

class SaveMappingsRequest(BaseModel):
    checked_grn_ids: list[str]
    confirmed_item_ids: list[str]


@router.patch("/invoices/{invoice_id}/stages/line_item_matching/mappings")
async def save_line_item_mappings(
    invoice_id: str,
    body: SaveMappingsRequest,
    current_user: CurrentUser,
):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    await executed_stages(db).update_one(
        {"run_id": oid, "stage_slug": "line_item_matching"},
        {"$set": {
            "confirmed_mappings": {
                "checked_grn_ids": body.checked_grn_ids,
                "confirmed_item_ids": body.confirmed_item_ids,
            }
        }},
        upsert=True,
    )

    return _envelope(data={"ok": True})


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

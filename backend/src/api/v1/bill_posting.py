import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import bills, email_log, executed_stages, invoices, pipeline_runs
from ...services.fixtures import get_loader
from ...services.invoice_state import get_invoice_schema
from ...services.zoho_bill import post_bill as zoho_post_bill
from .stages import approve_stage, reject_stage

router = APIRouter(tags=["bill_posting"])


from ._common import (
    _envelope,
    _extract_field,
    _oid,
    _require_admin,
    _require_editor,
    _unwrap_fixture,
)


# VAT codes — country-specific data loaded from the script output.
_VAT_CODES_FILE = Path(__file__).resolve().parents[3] / "scripts" / "vat_codes.json"

_CURRENCY_TO_COUNTRY: dict[str, str] = {
    "SGD": "SG",
    "MYR": "MY",
    "PHP": "PH",
    "IDR": "ID",
    "HKD": "HK",
}


@router.get("/vat-codes")
async def get_vat_codes(currency: str = Query(default="")):
    """Return SAP VAT codes for the given invoice currency."""
    country = _CURRENCY_TO_COUNTRY.get(currency.upper(), "")
    if not country or not _VAT_CODES_FILE.exists():
        return {"country": country, "codes": []}

    with _VAT_CODES_FILE.open() as fh:
        all_codes: dict = json.load(fh)

    raw = all_codes.get(country, [])
    if not isinstance(raw, list):
        return {"country": country, "codes": []}

    codes = [
        {
            "tax_code": item["TAX_CODE"],
            "description": item["DESCRIPTION"],
            "percentage": item["PERCENTAGE"].strip(),
        }
        for item in raw
    ]
    return {"country": country, "codes": codes}


# Generic accounting fallback when the bill-posting fixture carries no
# per-line account for an invoice line item.
_DEFAULT_BILL_ACCOUNT = {"account_code": "5000", "account_name": "Expense"}

# Philippine BIR WHT rate → SAP code mapping. Ordered from smallest to largest
# so the first match within tolerance wins.
_WHT_RATE_TO_CODE: list[tuple[float, str]] = [
    (0.01, "05"),   # Purchase of Goods 1%
    (0.02, "01"),   # Technical/Mgmt/Consulting 2%
    (0.03, "06"),   # Purchase of Minerals 3%
    (0.04, "02"),   # Consulting (Other) 4%
    (0.05, "03"),   # Rental of Property 5%
    (0.10, "04"),   # Rental of Movable Property 10%
]


def _infer_wht_code(wht: float, subtotal: float) -> str | None:
    """Return the SAP WHT code that best matches the effective WHT rate.

    Computes rate = wht / subtotal and finds the closest entry in
    ``_WHT_RATE_TO_CODE`` within a ±0.5 % tolerance window. Returns *None*
    when WHT or subtotal is zero/missing so callers can leave the field blank.
    """
    if wht <= 0 or subtotal <= 0:
        return None
    rate = wht / subtotal
    for known_rate, code in _WHT_RATE_TO_CODE:
        if abs(rate - known_rate) < 0.005:
            return code
    return None


def _resolve_bill_line_items(
    invoice_schema: dict, bp_fixture: dict, overrides: dict, header: dict | None = None
) -> list[dict]:
    """Build the complete set of bill-posting line items.

    The bill_posting fixture only carries accounting metadata for a *subset*
    of lines, while the bill header total reflects the *whole* invoice. We
    therefore emit one bill line per invoice (extraction) line item so the
    line-item table is complete and, when simulating, Debit (Σ line totals)
    balances Credit (vendor total). Accounting fields come from the matching
    fixture line (by invoice row id), else the fixture's primary account.
    Per-line user overrides are merged last.
    """
    inv_items = invoice_schema.get("line_items", []) or []
    fixture_items = bp_fixture.get("line_items", []) or []

    by_row: dict[str, dict] = {}
    for fi in fixture_items:
        key = fi.get("invoice_line_id")
        if key:
            by_row[str(key)] = fi

    # Fixtures use a single account for the whole bill; use the first line's
    # account as the default, falling back to a generic expense account.
    primary = fixture_items[0] if fixture_items else {}
    default_code = primary.get("account_code") or _DEFAULT_BILL_ACCOUNT["account_code"]
    default_name = primary.get("account_name") or _DEFAULT_BILL_ACCOUNT["account_name"]

    # Derive a WHT code from the bill header's effective WHT rate as a fallback
    # when the fixture line doesn't carry an explicit wht_tax_code (covers real /
    # non-fixture invoices and any fixture missing the field).
    _hdr = header or bp_fixture.get("bill_header", {})
    _inferred_wht = _infer_wht_code(
        float(_hdr.get("wht") or 0),
        float(_hdr.get("subtotal") or 0),
    )

    # No extraction line items (shouldn't happen) → fall back to the fixture.
    if not inv_items:
        return [
            {**it, **overrides.get(it.get("id", ""), {})} for it in fixture_items
        ]

    items: list[dict] = []
    for idx, inv in enumerate(inv_items, start=1):
        row_id = inv.get("row_id")
        src = by_row.get(str(row_id), {})
        item_id = f"bl_{idx}"
        item = {
            "id": item_id,
            "invoice_line_id": row_id,
            "description": inv.get("item_description") or src.get("description") or "",
            "quantity": inv.get("quantity"),
            "unit_price": inv.get("unit_price"),
            "total": inv.get("total_price_before_vat"),
            "account_code": src.get("account_code") or default_code,
            "account_name": src.get("account_name") or default_name,
            "tax_type": src.get("tax_type"),
            # Fixture-level SAP tax codes; wht_tax_code falls back to the rate-
            # inferred code so the dropdown is pre-selected even for invoices that
            # lack an explicit code in their bill_posting fixture.
            "vat_tax_code": src.get("vat_tax_code") or primary.get("vat_tax_code"),
            "wht_tax_code": src.get("wht_tax_code") or primary.get("wht_tax_code") or _inferred_wht,
        }
        item.update(overrides.get(item_id, {}))
        items.append(item)
    return items


# ── GET /api/v1/invoices/{id}/stages/bill_posting ──────────────────────────────

@router.get("/invoices/{invoice_id}/stages/bill_posting")
async def get_bill_posting(invoice_id: str, current_user: CurrentUser):
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
    bp_fixture = _unwrap_fixture(bundle.bill_posting if bundle else {})

    # Check if edits were saved to bills collection
    saved = await bills(db).find_one({"run_id": oid}) or {}
    overrides = saved.get("line_item_overrides", {})
    metadata_overrides = saved.get("metadata_overrides", {})

    header = bp_fixture.get("bill_header", {})

    # All invoice line items (with accounting metadata + overrides applied),
    # not just the truncated subset the fixture carries.
    line_items = _resolve_bill_line_items(invoice_schema, bp_fixture, overrides)

    stage_doc = await executed_stages(db).find_one({"run_id": oid, "stage_slug": "bill_posting"}) or {}

    # ERP / Zoho post result (only populated after a successful Post-to-ERP).
    erp = {
        "bill_id": saved.get("bill_id", ""),
        "bill_number": saved.get("bill_number", ""),
        "zoho_reference": saved.get("zoho_reference", ""),
        "zoho_url": saved.get("zoho_url", ""),
        "posted_at": saved.get("posted_at").isoformat() if saved.get("posted_at") else None,
    }

    return _envelope(data={
        "invoice_number": _extract_field(invoice_schema, "invoice_number"),
        "invoice_date": _extract_field(invoice_schema, "invoice_date"),
        "vendor_name": _extract_field(invoice_schema, "vendor_name"),
        "file_name": run.get("file_name", ""),
        "fixture_key": fixture_key,
        "status": run.get("status", "in_progress"),
        "stage_status": stage_doc.get("status", "in_review"),
        "bill_header": header,
        "line_items": line_items,
        # SAP-style edits persisted by the bill-posting edit endpoint
        # (Reference, Text, Ref Keys, Assignment, Doc Header, Ref Key 2).
        "metadata_overrides": metadata_overrides,
        # Zoho post outcome — used by the front-end to render the bill link
        # in the post-posted success banner.
        "erp": erp,
    })


# ── POST .../simulate ──────────────────────────────────────────────────────────
#
# Mirrors invoice-validator-fe's "Simulate" on the Bill Posting page. The real
# validator-be proxies to an n8n webhook that returns the simulated SAP/ERP
# posting document (the debit/credit journal preview). This demo has no n8n, so
# we synthesize the same FE-ready contract (headers / rows / totals / meta +
# status & message) directly from the bill-posting fixture, mirroring
# interfaces/billPosting.ts → SimulateDocumentData.

_COUNTRY_BY_CCY = {
    "INR": "IN", "PHP": "PH", "USD": "US", "EUR": "DE",
    "GBP": "GB", "MYR": "MY", "IDR": "ID", "JPY": "JP",
}

def _build_vat_code_to_pct() -> dict[str, str]:
    """Build TAX_CODE → 'PCT%' map from vat_codes.json. 0% codes map to empty string
    so that zero-rate entries don't show a redundant '0%' in the simulate description."""
    if not _VAT_CODES_FILE.exists():
        return {}
    try:
        with _VAT_CODES_FILE.open() as fh:
            data: dict = json.load(fh)
    except Exception:
        return {}
    result: dict[str, str] = {}
    for entries in data.values():
        if not isinstance(entries, list):
            continue
        for item in entries:
            code = item.get("TAX_CODE", "")
            pct_raw = item.get("PERCENTAGE", "").strip()
            if code and code not in result:
                try:
                    pct_val = float(pct_raw)
                    result[code] = f"{int(pct_val)}%" if pct_val == int(pct_val) else f"{pct_val}%"
                except ValueError:
                    result[code] = ""
    return result


_VAT_CODE_TO_PCT: dict[str, str] = _build_vat_code_to_pct()

def _build_vat_code_labels() -> dict[str, str]:
    """Build TAX_CODE → 'CODE: DESCRIPTION PCT%' map from vat_codes.json."""
    if not _VAT_CODES_FILE.exists():
        return {}
    try:
        with _VAT_CODES_FILE.open() as fh:
            data: dict = json.load(fh)
    except Exception:
        return {}
    labels: dict[str, str] = {}
    for entries in data.values():
        if not isinstance(entries, list):
            continue
        for item in entries:
            code = item.get("TAX_CODE", "")
            desc = item.get("DESCRIPTION", "")
            pct_raw = item.get("PERCENTAGE", "").strip()
            try:
                pct_val = float(pct_raw)
                pct_str = f"{int(pct_val)}%" if pct_val == int(pct_val) else f"{pct_val}%"
            except ValueError:
                pct_str = pct_raw
            if code and code not in labels:
                label = f"{code}: {desc}" if desc.rstrip().endswith(pct_str) else f"{code}: {desc} {pct_str}"
                labels[code] = label
    return labels


_VAT_CODE_LABELS: dict[str, str] = _build_vat_code_labels()

# WHT code → display percentage (mirrors _WHT_RATE_TO_CODE entries).
_WHT_CODE_TO_PCT: dict[str, str] = {
    "00": "0%",
    "01": "2%",
    "02": "4%",
    "03": "5%",
    "04": "10%",
    "05": "1%",
    "06": "3%",
}


def _build_simulate_document(run_id, header: dict, line_items: list[dict]):
    currency = (header.get("currency") or "USD")
    vendor_name = header.get("vendor_name") or "Vendor"
    vendor_id = header.get("vendor_id") or "AP"
    bill_number = header.get("bill_number", "")
    subtotal = float(header.get("subtotal") or 0)
    tax_amount = float(header.get("tax_amount") or 0)
    total = float(header.get("total") or (subtotal + tax_amount))
    wht = float(header.get("wht") or 0)
    net_payable = float(header.get("net_amount_after_wht") or (total - wht))

    headers = [
        {"id": "position",    "label": "#",           "type": "text",   "width": 56},
        {"id": "posting_key", "label": "Posting Key", "type": "text",   "width": 120},
        {"id": "account",     "label": "G/L Account", "type": "text",   "width": 260},
        {"id": "description", "label": "Description",  "type": "text",   "width": 280},
        {"id": "tax_code",    "label": "Tax Code",    "type": "text",   "width": 100},
        {"id": "debit",       "label": "Debit",       "type": "number", "width": 140, "align": "right"},
        {"id": "credit",      "label": "Credit",      "type": "number", "width": 140, "align": "right"},
    ]

    rows: list[dict] = []
    pos = 1

    # Expense / GR-IR debit — one posting line per invoice line item.
    # tax_code: use the SAP VAT code the user selected; drop the raw fixture
    # "tax_type" string (e.g. "VAT 12%") — it is not a valid SAP code.
    for it in line_items:
        amount = it.get("total")
        if amount is None:
            amount = float(it.get("quantity") or 0) * float(it.get("unit_price") or 0)
        rows.append({
            "position": pos,
            "posting_key": "40 · Debit",
            "account": f"{it.get('account_code') or '5000'} · {it.get('account_name') or 'Expense'}",
            "description": it.get("description") or "Line item",
            "tax_code": it.get("vat_tax_code") or "—",
            "debit": round(float(amount or 0), 2),
            "credit": 0,
            "is_visible": True,
        })
        pos += 1

    # Input tax debit — use the VAT code from the first line item (same
    # tax type applies to the recovery posting). Fall back to "VS" if not set.
    input_vat_code = next(
        (it.get("vat_tax_code") for it in line_items if it.get("vat_tax_code")),
        "VS",
    )
    if tax_amount > 0:
        # Append the tax percentage to the description for all VAT codes
        # except IO (non-GST registered supplier — no percentage displayed).
        vat_pct = _VAT_CODE_TO_PCT.get(input_vat_code, "")
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

    # Withholding tax credit — use the WHT code the user selected on the
    # line item (first non-empty selection). Avoids showing a generic "WH"
    # placeholder that doesn't correspond to any real SAP WHT code.
    wht_code = next(
        (it.get("wht_tax_code") for it in line_items if it.get("wht_tax_code")),
        "—",
    )
    if wht > 0:
        # Append the WHT rate percentage to the description.
        wht_pct = _WHT_CODE_TO_PCT.get(wht_code, "")
        wht_desc = f"WHT deduction at source · {wht_pct}" if wht_pct else "WHT deduction at source"
        rows.append({
            "position": pos,
            "posting_key": "50 · Credit",
            "account": "2230 · Withholding Tax Payable",
            "description": wht_desc,
            "tax_code": wht_code,
            "debit": 0,
            "credit": round(wht, 2),
            "is_visible": True,
        })
        pos += 1

    # Vendor (Accounts Payable) credit — net amount payable.
    rows.append({
        "position": pos,
        "posting_key": "31 · Credit",
        "account": f"{vendor_id} · {vendor_name}",
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
            "run_id": str(run_id),
            "bill_number": bill_number,
            "currency": currency,
            "country_code": _COUNTRY_BY_CCY.get(currency.upper(), ""),
            "line_item_count": len(line_items),
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        },
    }

    balanced = abs(balance) < 0.01
    if balanced:
        status = "success"
        message = (
            f"Document simulated successfully — the posting is balanced "
            f"(Debit = Credit = {debit_total:,.2f} {currency})."
        )
    else:
        status = "error"
        message = (
            f"Simulation failed — the document is not balanced "
            f"(difference {balance:,.2f} {currency})."
        )

    # VAT code enforcement — use fixture required_vat_code if set.
    required_vat_code = header.get("required_vat_code")
    if required_vat_code and status == "success":
        invalid_codes = [
            it.get("vat_tax_code")
            for it in line_items
            if it.get("vat_tax_code") and it.get("vat_tax_code") != required_vat_code
        ]
        if invalid_codes:
            status = "error"
            vat_label = _VAT_CODE_LABELS.get(required_vat_code, required_vat_code)
            message = (
                f"Simulation failed — invalid VAT/GST Tax Code '{invalid_codes[0]}' on line item. "
                f"This invoice requires '{vat_label}'."
            )

    # WHT code enforcement — use fixture required_wht_code if set, otherwise
    # infer from the effective WHT rate so enforcement is uniform across all invoices.
    required_wht_code = header.get("required_wht_code") or _infer_wht_code(wht, subtotal)
    if required_wht_code and wht > 0 and status == "success":
        invalid_wht = [
            it.get("wht_tax_code")
            for it in line_items
            if it.get("wht_tax_code") and it.get("wht_tax_code") != required_wht_code
        ]
        if invalid_wht:
            status = "error"
            wht_pct = _WHT_CODE_TO_PCT.get(required_wht_code, "")
            wht_label = f"{required_wht_code} · TECHNICAL/MGMT/CONSULTING SERV. {wht_pct}" if wht_pct else required_wht_code
            message = (
                f"Simulation failed — invalid WHT Tax Code '{invalid_wht[0]}' on line item. "
                f"This invoice requires '{wht_label}'."
            )

    return status, message, document


@router.post("/invoices/{invoice_id}/stages/bill_posting/simulate")
async def simulate_bill_posting(invoice_id: str, current_user: CurrentUser):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice_schema = await get_invoice_schema(db, oid)

    loader = get_loader()
    bundles = loader.discover()
    fixture_key = run.get("fixture_key", "")
    bundle = bundles.get(fixture_key)
    bp_fixture = _unwrap_fixture(bundle.bill_posting if bundle else {})

    saved = await bills(db).find_one({"run_id": oid}) or {}
    overrides = saved.get("line_item_overrides", {})

    header = dict(bp_fixture.get("bill_header", {}))
    # Prefer the live invoice vendor name (post-edit) over the fixture.
    header["vendor_name"] = (
        _extract_field(invoice_schema, "vendor_name") or header.get("vendor_name", "")
    )
    # Simulate against ALL invoice line items so Debit (Σ line totals) balances
    # Credit (vendor total = bill header total).
    line_items = _resolve_bill_line_items(invoice_schema, bp_fixture, overrides)

    status, message, document = _build_simulate_document(oid, header, line_items)
    return _envelope(data={"status": status, "message": message, "document": document})


# ── PATCH .../edit ─────────────────────────────────────────────────────────────

class EditLineItem(BaseModel):
    id: str
    account_id: Optional[str] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    tax_id: Optional[str] = None
    tax_type: Optional[str] = None
    # New SAP-style fields (replaces account/tax) — VAT and WHT tax code per line item.
    vat_tax_code: Optional[str] = None
    wht_tax_code: Optional[str] = None


class EditRequest(BaseModel):
    line_items: Optional[list[EditLineItem]] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    # New: SAP-style metadata edits keyed by field name (reference, text,
    # ref_key_head_1, ref_key_head_2, assignment, doc_header, ref_key_2).
    metadata: Optional[dict[str, str]] = None


@router.patch("/invoices/{invoice_id}/stages/bill_posting/edit")
async def edit_bill_posting(
    invoice_id: str,
    body: EditRequest,
    current_user: CurrentUser,
):
    _require_editor(current_user)
    db = get_db()
    oid = _oid(invoice_id)

    run = await pipeline_runs(db).find_one({"_id": oid}, {"_id": 1})
    if not run:
        raise HTTPException(status_code=404, detail="Invoice not found")

    now = datetime.now(timezone.utc)

    update_set: dict = {"updated_at": now}

    # Build line item overrides
    overrides: dict = {}
    for item in (body.line_items or []):
        patch: dict = {}
        if item.account_id is not None:
            patch["account_id"] = item.account_id
        if item.account_code is not None:
            patch["account_code"] = item.account_code
        if item.account_name is not None:
            patch["account_name"] = item.account_name
        if item.tax_id is not None:
            patch["tax_id"] = item.tax_id
        if item.tax_type is not None:
            patch["tax_type"] = item.tax_type
        if item.vat_tax_code is not None:
            patch["vat_tax_code"] = item.vat_tax_code
        if item.wht_tax_code is not None:
            patch["wht_tax_code"] = item.wht_tax_code
        if patch:
            overrides[item.id] = patch
    if overrides:
        update_set["line_item_overrides"] = overrides

    # Save date overrides from metadata tab
    if body.invoice_date:
        update_set["invoice_date"] = body.invoice_date
    if body.due_date:
        update_set["due_date"] = body.due_date

    # Persist SAP-style metadata edits so the post-posted read-only page
    # surfaces the values the user typed before clicking Post-to-ERP.
    if body.metadata:
        update_set["metadata_overrides"] = body.metadata

    await bills(db).update_one(
        {"run_id": oid},
        {"$set": update_set},
        upsert=True,
    )

    return _envelope(data={"updated": len(overrides) + (1 if body.invoice_date else 0) + (1 if body.due_date else 0)})


# ── POST .../post ──────────────────────────────────────────────────────────────

@router.post("/invoices/{invoice_id}/stages/bill_posting/post")
async def post_bill_to_erp(invoice_id: str, current_user: CurrentUser):
    _require_editor(current_user)
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
    bp_fixture = _unwrap_fixture(bundle.bill_posting if bundle else {})

    # Apply any saved overrides from the bills collection
    saved = await bills(db).find_one({"run_id": oid}) or {}
    overrides = saved.get("line_item_overrides", {})
    # Post the full set of invoice line items (matches what the user sees /
    # simulated), not just the truncated fixture subset.
    line_items = _resolve_bill_line_items(invoice_schema, bp_fixture, overrides)

    header = bp_fixture.get("bill_header", {})

    # Enforce required VAT code before posting.
    required_vat_code = header.get("required_vat_code")
    if required_vat_code:
        invalid = [
            it.get("vat_tax_code")
            for it in line_items
            if it.get("vat_tax_code") and it.get("vat_tax_code") != required_vat_code
        ]
        if invalid:
            vat_label = _VAT_CODE_LABELS.get(required_vat_code, required_vat_code)
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Bill posting failed — invalid VAT/GST Tax Code '{invalid[0]}' selected. "
                    f"This invoice requires '{vat_label}'. "
                    f"Please correct the VAT/GST Tax Code and try again."
                ),
            )

    # Enforce required WHT code before posting (infer from rate if not explicit in fixture).
    subtotal_hdr = float(header.get("subtotal") or 0)
    wht_hdr = float(header.get("wht") or 0)
    required_wht_code = header.get("required_wht_code") or _infer_wht_code(wht_hdr, subtotal_hdr)
    if required_wht_code and wht_hdr > 0:
        invalid_wht = [
            it.get("wht_tax_code")
            for it in line_items
            if it.get("wht_tax_code") and it.get("wht_tax_code") != required_wht_code
        ]
        if invalid_wht:
            wht_label = _WHT_CODE_TO_PCT.get(required_wht_code, "")
            required_label = f"{required_wht_code} · TECHNICAL/MGMT/CONSULTING SERV. {wht_label}" if wht_label else required_wht_code
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Bill posting failed — invalid WHT Tax Code '{invalid_wht[0]}' selected. "
                    f"This invoice requires '{required_label}'. "
                    f"Please correct the WHT Tax Code and try again."
                ),
            )

    vendor_name = _extract_field(invoice_schema, "vendor_name") or header.get("vendor_name", "")
    bill_number = header.get("bill_number", "")
    bill_date = saved.get("invoice_date") or _extract_field(invoice_schema, "invoice_date") or header.get("bill_date", "")
    due_date = saved.get("due_date") or header.get("due_date", "")
    reference = header.get("reference", "")
    currency = _extract_field(invoice_schema, "currency") or header.get("currency", "")

    now = datetime.now(timezone.utc)

    try:
        zoho_result = await zoho_post_bill(
            vendor_name=vendor_name,
            bill_date=bill_date,
            due_date=due_date,
            reference_number=reference,
            currency_code=currency,
            tax_amount=float(header.get("tax_amount") or 0),
            wht_amount=float(header.get("wht") or 0),
            line_items=[
                {
                    "description": li.get("description", ""),
                    "account_id": li.get("account_id"),
                    "account_code": li.get("account_code", ""),
                    "account_name": li.get("account_name", ""),
                    "tax_id": li.get("tax_id"),
                    "quantity": li.get("quantity", 1),
                    "unit_price": li.get("unit_price", 0),
                }
                for li in line_items
            ],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Zoho Books error: {exc}") from exc

    erp_result = {
        "run_id": oid,
        "bill_id": zoho_result["bill_id"],
        "bill_number": zoho_result["bill_number"],
        "zoho_reference": zoho_result["zoho_reference"],
        "zoho_url": zoho_result.get("zoho_url", ""),
        "status": "posted",
        "posted_at": now,
        "notification_email": "",
        "vendor_name": vendor_name,
        "total": header.get("total", 0),
        "currency": header.get("currency", ""),
    }

    await bills(db).update_one(
        {"run_id": oid},
        {"$set": {**erp_result, "updated_at": now}},
        upsert=True,
    )

    await email_log(db).insert_one({
        "run_id": oid,
        "invoice_id": None,
        "to": "",
        "subject": f"Invoice {erp_result['bill_number']} posted to Zoho Books",
        "body": f"Bill {erp_result['bill_number']} has been posted. Zoho reference: {erp_result['zoho_reference']}.",
        "status": "sent",
        "sent_at": now,
        "created_at": now,
    })

    await approve_stage(
        db, oid,
        slug="bill_posting",
        current_user=current_user,
        action="bill_posting.submitted",
        payload={
            "zoho_reference": erp_result["zoho_reference"],
            "notification_email": "",
        },
    )

    # Defensive belt-and-suspenders write — approve_stage → _complete_pipeline
    # already does this, but we re-assert the terminal state here so the run
    # is unambiguously "completed" with a definitive current_stage marker.
    # Idempotent — repeated POSTs (which shouldn't happen) just stamp the
    # same values.
    await pipeline_runs(db).update_one(
        {"_id": oid},
        {"$set": {
            "status": "completed",
            "current_stage": {
                "slug": "bill_posting",
                "display_name": "Bill Posting",
                "status": "completed",
            },
            "updated_at": now,
        }},
    )
    await executed_stages(db).update_one(
        {"run_id": oid, "stage_slug": "bill_posting"},
        {"$set": {
            "status": "completed",
            "completed_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )
    await invoices(db).update_one(
        {"run_id": oid},
        {"$set": {"status": "completed", "updated_at": now}},
    )

    # Send confirmation email to original sender for email-ingested invoices
    notification_email = ""
    if run.get("source") == "email":
        sender_email = (run.get("source_meta") or {}).get("sender", "")
        if sender_email:
            notification_email = sender_email
            try:
                from ...services import gmail_client
                from ...services.email_templates import bill_posted_html
                posted_date = now.strftime("%d %b %Y")
                total_fmt = f"{erp_result['total']:,.2f}" if erp_result.get("total") else "—"
                html = bill_posted_html(
                    invoice_number=erp_result.get("bill_number", ""),
                    vendor_name=vendor_name,
                    currency=erp_result.get("currency", ""),
                    total_amount=total_fmt,
                    posted_date=posted_date,
                    zoho_reference=erp_result["zoho_reference"],
                    zoho_url=erp_result.get("zoho_url", ""),
                )
                await gmail_client.send_html_email(
                    to=sender_email,
                    subject=f"Invoice {erp_result['bill_number']} Posted Successfully",
                    html_body=html,
                )
            except Exception as exc:
                import logging
                logging.getLogger(__name__).exception(
                    "Bill posting notification email failed to %s: %s", sender_email, exc
                )

    return _envelope(data={
        "zoho_reference": erp_result["zoho_reference"],
        "bill_number": erp_result["bill_number"],
        "notification_email": notification_email,
        # Stay on the bill-posting page — it renders the read-only "Bill
        # Posted" view (with source file + Zoho bill link) when status is
        # completed.
        "redirect": f"/invoice/{invoice_id}/bill-posting",
    })


# ── POST .../reject ───────────────────────────────────────────────────────────

class RejectRequest(BaseModel):
    reason: str


@router.post("/invoices/{invoice_id}/stages/bill_posting/reject")
async def reject_bill_posting(
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

    await reject_stage(db, oid, "bill_posting", current_user, body.reason)
    return _envelope(data={"status": "rejected"})

"""
Workflow Settings — per-stage mandatory field configuration and tolerances.

GET  /api/v1/settings/workflow   → returns merged (defaults + overrides)
PUT  /api/v1/settings/workflow   → full replace (admin only)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import workflow_settings as wf_col

router = APIRouter(tags=["workflow_settings"])


from ._common import _envelope


# ── Default settings ──────────────────────────────────────────────────────────

DEFAULT_WORKFLOW_SETTINGS: dict = {
    "extraction_metadata": {
        "label": "Extraction — Metadata",
        "stage": "extraction",
        "fields": [
            {"key": "po_number",                   "label": "PO Number",                    "mandatory": True,  "tolerance": None},
            {"key": "invoice_number",               "label": "Invoice Number",               "mandatory": True,  "tolerance": None},
            {"key": "invoice_date",                 "label": "Invoice Date",                 "mandatory": True,  "tolerance": None},
            {"key": "payment_terms",                "label": "Payment Terms",                "mandatory": False, "tolerance": None},
            {"key": "due_date",                     "label": "Due Date",                     "mandatory": False, "tolerance": None},
            {"key": "vendor_name",                  "label": "Vendor Name",                  "mandatory": True,  "tolerance": None},
            {"key": "vendor_address",               "label": "Vendor Address",               "mandatory": False, "tolerance": None},
            {"key": "vendor_vat_id",                "label": "Vendor VAT ID",                "mandatory": False, "tolerance": None},
            {"key": "customer_legal_entity",        "label": "Customer Legal Entity",        "mandatory": False, "tolerance": None},
            {"key": "customer_address",             "label": "Customer Address",             "mandatory": False, "tolerance": None},
            {"key": "customer_vat_id",              "label": "Customer VAT ID",              "mandatory": True,  "tolerance": None},
            {"key": "description",                  "label": "Description",                  "mandatory": False, "tolerance": None},
            {"key": "currency",                     "label": "Currency",                     "mandatory": True,  "tolerance": None},
            {"key": "total_amount_before_vat",      "label": "Total Amount Before VAT",      "mandatory": True,  "tolerance": None},
            {"key": "vat_gst",                      "label": "VAT / GST",                    "mandatory": False, "tolerance": None},
            {"key": "total_amount",                 "label": "Total Amount After VAT",       "mandatory": True,  "tolerance": None},
            {"key": "wht",                          "label": "WHT",                          "mandatory": False, "tolerance": None},
            {"key": "net_amount_after_wht",         "label": "Net Amount After WHT",         "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_name",             "label": "Vendor Bank Name",             "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_account_name",     "label": "Vendor Bank Account Name",     "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_account_number",   "label": "Vendor Bank Account Number",   "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_swift",            "label": "Vendor Bank SWIFT",            "mandatory": False, "tolerance": None},
            # total_quantity is extracted by the AI alongside the other metadata
            # fields and must be in settings so it is not hidden by the mask filter.
            {"key": "total_quantity",               "label": "Total Quantity",               "mandatory": False, "tolerance": None},
        ],
    },
    "extraction_line_items": {
        "label": "Extraction — Line Items",
        "stage": "extraction",
        "fields": [
            {"key": "item_code",              "label": "Item Code",                "mandatory": False, "tolerance": None},
            {"key": "item_description",       "label": "Item Description",         "mandatory": True,  "tolerance": None},
            {"key": "unit_of_measurement",    "label": "Unit of Measurement",      "mandatory": False, "tolerance": None},
            {"key": "quantity",               "label": "Quantity",                 "mandatory": False, "tolerance": None},
            {"key": "unit_price",             "label": "Unit Price",               "mandatory": False, "tolerance": None},
            {"key": "total_price_before_vat", "label": "Total Price Before VAT",   "mandatory": True,  "tolerance": None},
        ],
    },
    "vendor_validation": {
        "label": "Vendor Validation",
        "stage": "vendor_validation",
        "fields": [
            # Vendor Legal Entity — shown on the Metadata Matching page.
            {"key": "vendor_name",                "label": "Vendor Legal Entity",        "mask": True,  "mandatory": True,  "tolerance": None},
            # Hidden by default — not relevant for the core matching review.
            {"key": "vendor_vat_id",              "label": "Vendor VAT ID",              "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_address",             "label": "Vendor Address",             "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_name",           "label": "Vendor Bank Name",           "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_account_number", "label": "Vendor Bank Account Number", "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_account_name",   "label": "Vendor Bank Account Name",   "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_swift",          "label": "Vendor Bank SWIFT",          "mask": False, "mandatory": False, "tolerance": None},
        ],
    },
    "metadata_validation": {
        "label": "Metadata Validation",
        "stage": "metadata_validation",
        "fields": [
            # Keys must exactly match the field_name values in the fixture JSONs.
            # Visible by default (mask=True): the 6 core matching fields.
            # po_number is always shown regardless of mask (exempt field in MetadataTab).
            {"key": "customer_legal_entity",   "label": "Company Name",            "mask": True,  "mandatory": True,  "tolerance": None},
            {"key": "currency",                "label": "Currency",                "mask": True,  "mandatory": True,  "tolerance": None},
            {"key": "total_amount_before_vat", "label": "Total Amount Before VAT", "mask": True,  "mandatory": True,  "tolerance": 1.0},
            {"key": "vat_gst",                 "label": "VAT / GST Amount",        "mask": True,  "mandatory": False, "tolerance": 1.0},
            {"key": "total_amount",            "label": "Total Amount After VAT",  "mask": True,  "mandatory": True,  "tolerance": 1.0},
            # Hidden by default — can be un-masked by an admin in Workflow Settings.
            {"key": "customer_vat_id",         "label": "Customer VAT ID",         "mask": False, "mandatory": False, "tolerance": None},
            {"key": "customer_address",        "label": "Customer Address",        "mask": False, "mandatory": False, "tolerance": None},
            {"key": "payment_terms",           "label": "Payment Terms",           "mask": False, "mandatory": False, "tolerance": None},
            {"key": "due_date",                "label": "Due Date",                "mask": False, "mandatory": False, "tolerance": None},
            {"key": "total_quantity",          "label": "Total Quantity",          "mask": False, "mandatory": False, "tolerance": None},
            # Vendor bank fields — sourced from vendor_validation fixture.
            # Hidden by default alongside the other vendor_validation fields.
            {"key": "vendor_bank_name",            "label": "Vendor Bank Name",            "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_account_number",  "label": "Vendor Bank Account Number",  "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_account_name",    "label": "Vendor Bank Account Name",    "mask": False, "mandatory": False, "tolerance": None},
            {"key": "vendor_bank_swift",           "label": "Vendor Bank SWIFT",           "mask": False, "mandatory": False, "tolerance": None},
        ],
    },
    "line_item_validation": {
        "label": "Line Item Validation",
        "stage": "line_item_matching",
        "fields": [
            {"key": "item_code",              "label": "Item Code",              "mandatory": False, "tolerance": None},
            {"key": "item_description",       "label": "Item Description",       "mandatory": True,  "tolerance": None},
            {"key": "unit_of_measurement",    "label": "Unit of Measurement",    "mandatory": False, "tolerance": None},
            {"key": "quantity",               "label": "Quantity",               "mandatory": False, "tolerance": None},
            # Tolerance is N/A for line items — variance is controlled by the
            # per-currency CURRENCY_TOLERANCE in line_item_matching.py, not a
            # per-field confidence %.
            {"key": "unit_price",             "label": "Unit Price",             "mandatory": False, "tolerance": None},
            {"key": "total_price_before_vat", "label": "Total Price Before VAT", "mandatory": True,  "tolerance": None},
        ],
    },
    "erp_fields": {
        "label": "ERP Fields",
        "stage": "bill_posting",
        "fields": [
            # Keys must match the field names present in the bill_posting fixture
            # line_items. Tolerance is N/A for bill posting (no confidence scoring).
            # account_code / vat_tax_code / wht_tax_code exist in the fixture;
            # company_code and cost_center are SAP concepts absent from the demo.
            {"key": "account_code",  "label": "GL Account Code", "mandatory": False, "tolerance": None},
            {"key": "vat_tax_code",  "label": "VAT Tax Code",    "mandatory": False, "tolerance": None},
            {"key": "wht_tax_code",  "label": "WHT Tax Code",    "mandatory": False, "tolerance": None},
        ],
    },
}


# ── Field normalization ───────────────────────────────────────────────────────
#
# Invariants enforced everywhere (read + write) so the contract holds no matter
# what a client sends:
#   • `mask`      → field is shown on its page (default True; legacy/default
#                   configs have no `mask` key so they stay visible).
#   • `mandatory` → can only be True when `mask` is True. A hidden field can't
#                   be required, so mask OFF forces mandatory OFF.
#   • `tolerance` → preserved as-is (None = no percentage matching).

def _normalize_field(f: dict) -> dict:
    mask = bool(f.get("mask", True))
    mandatory = bool(f.get("mandatory", False)) and mask
    return {
        "key": f.get("key"),
        "label": f.get("label"),
        "mask": mask,
        "mandatory": mandatory,
        "tolerance": f.get("tolerance", None),
    }


def _normalize_fields(fields: list) -> list:
    return [_normalize_field(f) for f in (fields or [])]


# ── DB helper ─────────────────────────────────────────────────────────────────

async def get_workflow_settings(db) -> dict:
    """
    Returns merged settings: DEFAULT_WORKFLOW_SETTINGS overridden by any
    per-section docs stored in DB. Every field is normalized so `mask` always
    exists and the mandatory⇒mask invariant always holds.

    Saved overrides are merged field-by-key rather than a full replacement so
    that renamed or removed default keys are silently dropped (self-healing).
    This prevents stale DB entries from hiding fields after a key rename.
    """
    import copy
    result = copy.deepcopy(DEFAULT_WORKFLOW_SETTINGS)

    cursor = wf_col(db).find({})
    overrides = await cursor.to_list(length=100)
    for doc in overrides:
        section = doc.get("section")
        if section not in result:
            continue
        saved_fields = doc.get("fields") or []
        saved_by_key = {f.get("key"): f for f in saved_fields if f.get("key")}

        # Merge saved per-field user config (mask/mandatory/tolerance) onto the
        # current defaults — keyed by field key. Any key that no longer exists
        # in the defaults (renamed/deleted) is silently dropped so stale data
        # can never hide or ghost a field.
        merged = []
        for df in result[section]["fields"]:
            key = df.get("key")
            if key in saved_by_key:
                sf = saved_by_key[key]
                merged.append({
                    **df,
                    "mask":      sf.get("mask",      df.get("mask",      True)),
                    "mandatory": sf.get("mandatory", df.get("mandatory", False)),
                    # Prefer saved tolerance (even None = user disabled it).
                    # Only fall back to the default when the key was absent
                    # from the saved doc entirely (first save was before this
                    # field gained a default tolerance).
                    "tolerance": sf.get("tolerance") if "tolerance" in sf else df.get("tolerance"),
                })
            else:
                merged.append(df)
        result[section]["fields"] = merged

    for sec, section in result.items():
        section["fields"] = _normalize_fields(section.get("fields", []))

    return result


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/settings/workflow")
async def get_workflow(current_user: CurrentUser):
    db = get_db()
    data = await get_workflow_settings(db)
    return _envelope(data=data)


class WorkflowSectionPayload(BaseModel):
    section: str
    fields: list[dict]


class WorkflowSettingsPayload(BaseModel):
    sections: list[WorkflowSectionPayload]


@router.put("/settings/workflow")
async def update_workflow(body: WorkflowSettingsPayload, current_user: CurrentUser):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    db = get_db()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    for section_data in body.sections:
        key = section_data.section
        if key not in DEFAULT_WORKFLOW_SETTINGS:
            raise HTTPException(status_code=400, detail=f"Unknown section: {key}")
        await wf_col(db).update_one(
            {"section": key},
            {"$set": {
                "section": key,
                # Normalize so mask⇒mandatory invariant is enforced server-side
                # regardless of what the client sent.
                "fields": _normalize_fields(section_data.fields),
                "updated_at": now,
            }},
            upsert=True,
        )

    data = await get_workflow_settings(db)
    return _envelope(data=data)

"""
Invoice <-> Contract field-mapping table for DirectPay.

Sourced verbatim from "Contract Invoice Mapping - Field Mapping.csv" — the
22 validation-check rows mirroring the real product's own
`_validate_invoice_payload_against_contract()` (server.py). This module is a
reference table only: matching.json's findings stay fixture-authored (per
DirectPay's fixture-driven design — see fixtures.py's docstring), this does
not compute them. It exists so any code that needs to answer "which
contract field does this invoice field compare against, and how" has one
canonical source instead of that logic being reverse-engineered from
individual matching.json fixtures.
"""
from dataclasses import dataclass
from typing import Optional

MatchType = Optional[str]  # "Fuzzy" | "Exact" | "Range" | "Derived" | "Arithmetic" | None


@dataclass(frozen=True)
class FieldMapping:
    number: int
    section: str
    invoice_field: str
    contract_field: Optional[str]
    field_label: Optional[str]  # the contract field's own display label
    match_type: MatchType
    validation_logic: str
    notes: str


FIELD_MAPPINGS: list[FieldMapping] = [
    # ── IDENTITY & PARTIES ───────────────────────────────────────────────
    FieldMapping(1, "IDENTITY & PARTIES", "vendor_name", "vendor_name",
                 "Lessor Name", "Fuzzy",
                 "Fuzzy string match. Warns if similarity < threshold.",
                 "Also checks against lessor_company if available"),
    FieldMapping(2, "IDENTITY & PARTIES", "customer_legal_entity", "customer_name",
                 "Tenant Name", "Fuzzy",
                 "Fuzzy string match. Warns if similarity < threshold.",
                 "Also checks tenant_company"),
    FieldMapping(3, "IDENTITY & PARTIES", "vendor_vat_id", "lessor_npwp",
                 "Lessor NPWP", "Exact",
                 "Normalized string comparison (strip dots/dashes).",
                 "NPWP format: XX.XXX.XXX.X-XXX.XXX"),
    FieldMapping(4, "IDENTITY & PARTIES", "customer_vat_id", None,
                 "Tenant NPWP", "Exact",
                 "Normalized string comparison (strip dots/dashes).",
                 "Same normalization as vendor — no tenant_npwp field exists "
                 "in this fixture's 47-field contract extraction"),
    # ── BILLING PERIOD ───────────────────────────────────────────────────
    FieldMapping(5, "BILLING PERIOD", "billing_period_start", "actual_start",
                 "Lease Commencement Date", "Range",
                 "Invoice billing start must be >= contract commencement date.",
                 "Warns if invoice is for a period before lease started"),
    FieldMapping(6, "BILLING PERIOD", "billing_period_end", "lease_expiry_date",
                 "Lease Expiry Date", "Range",
                 "Invoice billing end must be <= contract expiry date.",
                 "Warns if invoice extends beyond lease term"),
    # ── AMOUNTS — PER CHARGE TYPE ────────────────────────────────────────
    FieldMapping(7, "AMOUNTS — PER CHARGE TYPE", "line_items[].amount (grouped by charge_type)",
                 "base_fee", "Monthly Rent", "Derived",
                 "Sum invoice line items per charge_type vs expected per-type amount "
                 "from contract. Tolerance: >2% deviation triggers warning.",
                 "BILLABLE_TYPES = {rental_fee, license_fee, service_fee}"),
    FieldMapping(8, "AMOUNTS — PER CHARGE TYPE", "line_items[].charge_type",
                 None, "Multiple fields", "Exact",
                 "Checks for unexpected charge heads — invoice has a charge type "
                 "not present in any contract clause.",
                 "Maps to: Monthly Rent, Security Deposit, Escalation, Revenue Share % "
                 "depending on type"),
    # ── TOTALS & TAX ─────────────────────────────────────────────────────
    FieldMapping(9, "TOTALS & TAX", "total_amount_before_vat", "base_fee",
                 "Monthly Rent", "Derived",
                 "Invoice subtotal vs expected monthly rent (sum of billable charges). "
                 ">2% tolerance.",
                 "Uses per-period rent if a payment schedule exists, else the "
                 "contract's flat monthly rate"),
    FieldMapping(10, "TOTALS & TAX", "tax_rate", None,
                 "Tax Structure", "Exact",
                 "Invoice tax rate must match contract-stipulated rate (e.g. PPN 11%).",
                 "No literal tax-rate field in this fixture's 47-field contract "
                 "extraction — DPP Nilai Lain method: effective 11% = 12% x (11/12)"),
    FieldMapping(11, "TOTALS & TAX", "vat_gst", None,
                 "Tax Structure", "Arithmetic",
                 "vat_gst must equal total_amount_before_vat x tax_rate (within rounding tolerance).",
                 "Cross-field arithmetic check on invoice itself"),
    FieldMapping(12, "TOTALS & TAX", "wht_rate", "wht_rate_pct",
                 "WHT Rate (%)", "Exact",
                 "Withholding tax rate match.",
                 "PPh 4(2) = 10% on property rental"),
    FieldMapping(13, "TOTALS & TAX", "wht", None,
                 "WHT / PPh Structure", "Arithmetic",
                 "wht must equal total_amount_before_vat x wht_rate.",
                 "Cross-field arithmetic check"),
    FieldMapping(14, "TOTALS & TAX", "total_amount", None,
                 "Monthly Rent + Tax + WHT", "Arithmetic",
                 "Grand total = subtotal + PPN - PPh (standard Indonesian formula).",
                 "Composite of rent, tax, and WHT contract fields"),
    # ── LINE ITEM DETAIL ─────────────────────────────────────────────────
    FieldMapping(15, "LINE ITEM DETAIL", "line_items[].quantity", None,
                 "Property / Premises Address", "Derived",
                 "For per-m² charges: quantity should match premises area from contract.",
                 "Area parsed from premises text (e.g. '65,23 m2')"),
    FieldMapping(16, "LINE ITEM DETAIL", "line_items[].unit_price", "base_fee",
                 "Monthly Rent", "Derived",
                 "Unit price vs contract rate per m² (per charge type).",
                 "Rate = Monthly Rent ÷ area, or Service Charge Rate from contract"),
    # ── PREMISES & PAYMENT ───────────────────────────────────────────────
    FieldMapping(17, "PREMISES & PAYMENT", "premises_floor", "floor",
                 "Floor", "Fuzzy",
                 "Floor / unit mentioned in invoice should match contract premises.",
                 "Parsed from invoice line item descriptions"),
    FieldMapping(18, "PREMISES & PAYMENT", "payment_terms", None,
                 "Rent Billing Day / Payment Structure", "Fuzzy",
                 "Payment terms consistency check (due date, net days).", ""),
    FieldMapping(19, "PREMISES & PAYMENT", "currency", "currency",
                 "Currency", "Exact",
                 "Currency code must match (IDR vs USD etc.).",
                 "Implicit from Monthly Rent currency"),
    # ── INVOICE-ONLY CHECKS (no contract counterpart) ───────────────────
    FieldMapping(20, "INVOICE-ONLY CHECKS", "invoice_number", None, None, None,
                 "Presence check only. No contract counterpart.",
                 "Used for deduplication / audit trail"),
    FieldMapping(21, "INVOICE-ONLY CHECKS", "invoice_date", None, None, None,
                 "Presence check. Cross-checked with billing_period for reasonableness.", ""),
    FieldMapping(22, "INVOICE-ONLY CHECKS", "tax_type", None, None, None,
                 "Labels the tax (PPN, GST). Informational, not validated against contract.", ""),
]

_BY_INVOICE_FIELD = {m.invoice_field: m for m in FIELD_MAPPINGS}


def get_field_mappings() -> list[FieldMapping]:
    return FIELD_MAPPINGS


def find_mapping_for_invoice_field(invoice_field: str) -> Optional[FieldMapping]:
    return _BY_INVOICE_FIELD.get(invoice_field)


def field_mapping_out(m: FieldMapping) -> dict:
    return {
        "number": m.number,
        "section": m.section,
        "invoice_field": m.invoice_field,
        "contract_field": m.contract_field,
        "field_label": m.field_label,
        "match_type": m.match_type,
        "validation_logic": m.validation_logic,
        "notes": m.notes,
    }


# ── Core cross-validation checklist ───────────────────────────────────────
# A fixed, product-defined set of fields the Matching page must ALWAYS show —
# distinct from FIELD_MAPPINGS above (which just documents the real
# product's 22-check reference logic). `mandatory` here directly drives
# blocking/asterisk display; it does NOT come from a contract fixture's own
# Tag column the way earlier iterations of this feature did — this list IS
# the authority now. `contract_field=None` means the field is a computed
# amount with no literal contract-side figure to compare against (it still
# always shows, just with nothing to reconcile — see
# service.py's _is_finding_resolved).

@dataclass(frozen=True)
class CoreValidationField:
    invoice_field: str
    contract_field: Optional[str]
    label: str
    mandatory: bool


CORE_CROSS_VALIDATION_FIELDS: list[CoreValidationField] = [
    CoreValidationField("vendor_name", "vendor_name", "Vendor Name", True),
    # Split from a single "Bank Details (Account Name & Number)" field per
    # earlier request, then reverted back to non-mandatory per explicit
    # follow-up — still shown on the checklist for visibility, just never
    # blocks approval.
    CoreValidationField("vendor_bank_account_name", "lessor_bank_account_name", "Bank Account Name", False),
    CoreValidationField("vendor_bank_account_number", "lessor_bank_account_number", "Bank Account Number", False),
    CoreValidationField("vendor_address", "premises_address", "Store Location", True),
    # Reinstated, non-mandatory by explicit instruction — the Invoice column
    # is deliberately always blank (see service.py's _INSTALLMENT_MATCH_FIELD_MAP
    # comment): real invoices for a lumpsum-installment lease (PT_BANGUN)
    # state the overall lease term, not a specific billing cycle, so there's
    # nothing genuine to compare against. contract_field=None because the
    # real source is the matched installment, not a flat contract field —
    # same pattern as the amount fields below. Mandatory would permanently
    # block Approve with no way to resolve, since there's no invoice value an
    # Acknowledge could ever apply to.
    CoreValidationField("billing_period_start", None, "Billing Period Start", False),
    CoreValidationField("billing_period_end", None, "Billing Period End", False),
    # Reinstated mandatory per explicit instruction, ACK also removed on the
    # frontend (see MatchingTable.tsx's _NO_ACK_FIELDS) — a permanent block
    # (e.g. RATNA_INTAN's invoice genuinely having no VAT line vs. the
    # contract's real figure) is the intended outcome now: this money field
    # must be exactly correct to proceed, with no acknowledge-to-bypass
    # shortcut. Tax Amount (vat_gst) and Total Amount After VAT (total_amount)
    # were both tried on this checklist in earlier rounds and then explicitly
    # removed — Total Amount Before VAT alone is the checklist's amount check
    # now.
    CoreValidationField("total_amount_before_vat", "base_fee", "Total Amount Before VAT", True),
]

_CORE_BY_INVOICE_FIELD = {c.invoice_field: c for c in CORE_CROSS_VALIDATION_FIELDS}


def find_core_field(invoice_field: str) -> Optional[CoreValidationField]:
    return _CORE_BY_INVOICE_FIELD.get(invoice_field)

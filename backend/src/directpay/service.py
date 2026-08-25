"""
DirectPay core business logic — the shared layer both the HTTP router
(router.py) and the Auto-Process cascade (stp.py) call into, so a human's
click and STP's automated equivalent always run the exact same code path.
Mirrors the P2P split between `stages.approve_stage()` (shared core) and its
thin HTTP wrappers in `api/v1/*.py`.
"""
import hashlib
import json
import re
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
# extraction -> extracted -> fp_extraction -> extracted -> matching ->
# bill_posting -> posted, with "rejected" a possible exit at any point. There
# is no separate "accepted"/"validated" terminal status — Matching's approval
# moves the invoice on to Bill Posting, same as P2P's own
# metadata_validation/line_item_matching approval moves it to bill_posting
# rather than ending the pipeline there.
#
# fp_extraction mirrors P2P's own STAGE_SEQUENCE placement exactly (see
# backend/src/api/v1/stages.py): it sits right after extraction, gated on IDR
# currency AND on a real FP document actually existing for this vendor/
# document (see confirm_extraction) — a vendor with no Faktur Pajak ever
# captured (e.g. RATNA_INTAN) skips this stage entirely rather than showing
# an empty review screen for a document that was never there. A non-IDR
# invoice (never happens in today's DP fixtures, but kept for parity) also
# skips straight through, same as P2P auto-skipping to metadata_validation.
# Confirming extraction moves "extracted" straight to "fp_extraction" if it
# applies, else it stays "extracted"; approving the FP stage moves it back to
# "extracted" — the same status a vendor with no FP would already be sitting
# at post-confirm — so match.tsx's existing "extracted is ready to match"
# logic needs no changes at all.
#
# An earlier round of this module had a separate "postprocessing" stage
# between fp_extraction and extracted (deriving due_date/WHT/net-amount from
# the underlying lease's payment schedule for review before Matching) — it
# was removed per explicit instruction as unnecessary; _apply_mandatory_
# field_coverage below already re-derives whatever Matching needs from the
# schedule directly, so nothing depended on that stage actually running.
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
    """Raised by review_action whenever open mandatory issues exist — no
    override exists for Matching's approve (see review_action's docstring);
    this is purely a defensive signal for a state the disabled Approve
    button shouldn't normally let a human reach. Also raised by
    approve_faktur_pajak, which — unlike Matching — does accept its own
    `force` to let a human proceed past an acknowledged mismatch."""
    message = "This invoice still has open issues. Do you still want to approve it?"


def _now():
    return datetime.now(timezone.utc)


def _merge(base: dict, overlay: Optional[dict]) -> dict:
    merged = dict(base or {})
    if overlay:
        merged.update(overlay)
    return merged


def _strip_na(values: dict) -> dict:
    """The Extraction/Review pages show the literal string "NA" for an
    absent fixture field (see the fixture JSON files themselves). Any code
    that computes off real invoice/contract data — Matching, Bill Posting,
    Simulate, the notification-email lookup — must keep treating that as
    "nothing there", not as a literal value to compare or do arithmetic
    against."""
    return {k: (None if v == "NA" else v) for k, v in values.items()}


def _normalize_for_memory(v) -> str:
    return str(v).strip().lower() if v is not None else ""


def _values_equal(a, b) -> bool:
    if ("" if a is None else str(a)) == ("" if b is None else str(b)):
        return True
    # A same-value round-trip through JSON can still change string form
    # without changing the value — Python keeps "675675676.0" for a
    # JSON-sourced float, but JS normalizes a whole-number float to
    # "675675676" when it serializes the edit payload back. Without this,
    # re-sending an untouched line item on every Confirm Extraction (the
    # frontend always resends the full array, edited or not) logs a false
    # "changed" entry in edit_history for every numeric field.
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return False


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
        # Drives whether approving Contract Review lands on the Extraction
        # Postprocessing stage or goes straight to "saved" (see
        # approve_contract) — surfaced here too so the frontend can decide
        # navigation without guessing at a bundle it can't see directly.
        "has_payment_schedule": bool(bundle and bundle.payment_schedule),
        # Same "View Edit History" gate the invoice side uses (see
        # invoice_out's own has_edit_history) — covers edits made on both
        # Contract Extraction (edit_contract/approve_contract) and Extraction
        # Postprocessing (edit_contract_extraction_postprocessing), since both
        # append to this same doc-level edit_history array.
        "has_edit_history": bool(doc.get("edit_history")),
        # Auto-Process progress for this contract — "processing" while the
        # cascade is driving it, then "done". Mirrors the invoice side's own
        # stp_state so the dashboard row can report it the same way.
        "stp_state": doc.get("stp_state"),
        "stp_failure_reason": doc.get("stp_failure_reason"),
        # "manual" (real multipart upload) vs "trigger" (/contracts/trigger-upload)
        # — same distinction and naming the invoice side records.
        "source": doc.get("source"),
        "tag": doc.get("tag"),
        "notify_email": doc.get("notify_email"),
        "pdf_url": f"/dp-api/contracts/{doc['_id']}/pdf",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _diff_contract_fields_patch(current: dict, patch: dict, user_email: str) -> list[dict]:
    """Same "old value is whatever was actually in effect before this edit"
    semantics as _diff_extracted_patch on the invoice side — Contract
    Extraction's fields are all flat (no line-items equivalent), so this is
    just the metadata half of that function, scope="metadata"."""
    now = _now()
    entries: list[dict] = []
    for key, new_value in (patch or {}).items():
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


def _diff_contract_postprocessing_patch(
    current_installments: list[dict], current_one_time_payments: list[dict],
    installments_patch: Optional[dict], one_time_payments_patch: Optional[dict],
    user_email: str,
) -> list[dict]:
    """Row-based diff for Extraction Postprocessing's per-installment/
    one-time-payment overrides — same row-index-keyed shape as
    _diff_extracted_patch's line_items half, scope="installment"/
    "one_time_payment" instead of "line_item"."""
    now = _now()
    entries: list[dict] = []

    def _diff_rows(current_rows: list[dict], patch: Optional[dict], scope: str):
        for idx_str, row_patch in (patch or {}).items():
            try:
                idx = int(idx_str)
            except ValueError:
                continue
            current_row = current_rows[idx] if 0 <= idx < len(current_rows) else {}
            for field, new_value in (row_patch or {}).items():
                old_v = current_row.get(field)
                if _values_equal(old_v, new_value):
                    continue
                entries.append({
                    "timestamp": now, "user_email": user_email, "scope": scope,
                    "field": field, "row_id": idx_str,
                    "old_value": None if old_v is None else str(old_v),
                    "new_value": None if new_value is None else str(new_value),
                })

    _diff_rows(current_installments, installments_patch, "installment")
    _diff_rows(current_one_time_payments, one_time_payments_patch, "one_time_payment")
    return entries


# Rent invoices consistently tie back to their matched installment (see
# conversation history — PT_BANGUN/RATNA_INTAN's own amounts either match
# exactly or are handled by the RATNA_INTAN-specific override above). A
# non-rent charge (Service Charge/Electricity/Water — Palladium's case)
# doesn't: Electricity/Water have no real schedule counterpart at all, and
# even Service Charge's own real per-sqft rate can move without a document
# to confirm it against. _NON_RENT_CHARGE_TYPES gates the difference+reasoning
# detail below to exactly this case, so a genuine Rent mismatch (a different
# kind of problem) doesn't get mislabeled with this reasoning too.
_NON_RENT_CHARGE_TYPES = {"service_fee", "utility_electricity", "utility_water"}


def _is_non_rent_invoice(extracted: dict) -> bool:
    line_items = extracted.get("line_items") or []
    return any(item.get("charge_type") in _NON_RENT_CHARGE_TYPES for item in line_items)


# Metered, consumption-based charges with NO real counterpart anywhere in a
# payment schedule (Palladium's only ever has Rent and Service Charge rows).
# _match_payment_installment still returns a "closest" installment for these
# (used elsewhere — Extraction Postprocessing, Bill Posting — where a
# fallback figure is still useful for WHT/due-date purposes), but the
# Matching page's Contract column shouldn't present that as a real
# comparison — per explicit instruction, it's shown empty instead of a
# misleadingly specific number from an unrelated schedule category.
_NO_SCHEDULE_CHARGE_TYPES = {"utility_electricity", "utility_water"}

# A revenue-share contract has no fixed rent at all: the amount due is a
# PERCENTAGE of the outlet's own reported sales, so the reference figure cannot
# come from the contract alone or from a supporting document alone — it is
# computed from one value in each.
#   Revenue Share %  <- the matched schedule row's own `revenue_share_pct`
#                       (contract derived fields)
#   Net Sales        <- the supporting document's `net_sales`, i.e. the sales
#                       report's own Sales (Ex. PB1) - Biaya Ojol - Discount
#   Rent due         =  Revenue Share % x Net Sales
# DEBORA_KEMANG is the first such vendor (Perjanjian Kerja Sama, 15% of Nilai
# Penjualan Bersih). Its OTHER invoice — a flat monthly IPL fee covering
# electricity/water plus security/cleaning — is deliberately NOT part of this:
# it is a fixed contractual amount with its own schedule, so it carries
# charge_type `ipl_fee` and is matched against that schedule the ordinary way.
_REVENUE_SHARE_CHARGE_TYPES = {"revenue_share"}


def _wht_gross_up_note(extracted: dict, contract_fields: dict, contract_value) -> Optional[str]:
    """Flag the case where an invoice's NET-of-withholding figure equals the
    contract amount while its GROSS exceeds it — i.e. the vendor grossed the
    charge up so that what it actually receives after PPh matches the contract.

    DEBORA_KEMANG's IPL invoice does exactly this: contract Rp15,000,000, invoice
    Rp16,666,666 gross, Rp1,666,666 PPh withheld, Rp15,000,000 net. The +11.11%
    gross figure fails the tolerance check, and this note explains WHY it fails
    so an escalation says something more useful than "exceeds threshold".

    Only raised when the contract itself says nothing about withholding — for a
    vendor whose contract does state it (PT_BANGUN, RATNA_INTAN: Yes / 10%) a
    gross-up is expected behaviour, not a discrepancy to report.
    """
    if contract_value is None:
        return None
    if contract_fields.get("wht_applicable") or contract_fields.get("wht_rate_pct"):
        return None
    try:
        wht = float(extracted.get("wht"))
        net = float(extracted.get("net_amount_after_wht"))
        gross = float(extracted.get("total_amount_before_vat"))
        reference = float(contract_value)
    except (TypeError, ValueError):
        return None
    if wht <= 0 or gross <= reference + 0.01:
        return None
    # The net has to land ON the contract figure — that is what makes it a
    # gross-up rather than simply an over-billed invoice.
    if abs(net - reference) > 0.01:
        return None
    return "Invoice looks like grossed up for wht which is not mentioned in the contract."


def _is_revenue_share_invoice(extracted: dict) -> bool:
    line_items = extracted.get("line_items") or []
    return any(item.get("charge_type") in _REVENUE_SHARE_CHARGE_TYPES for item in line_items)


def _revenue_share_reference(doc: dict, installment: Optional[dict]):
    """(amount_due, pct, net_sales) for a revenue-share invoice, or (None, ...)
    when either input is missing — never a partial guess."""
    supporting = doc.get("supporting_document") or {}
    net_sales = supporting.get("net_sales")
    pct = (installment or {}).get("revenue_share_pct")
    if net_sales is None or pct is None:
        return None, pct, net_sales
    try:
        return round(float(net_sales) * float(pct) / 100.0, 2), float(pct), float(net_sales)
    except (TypeError, ValueError):
        return None, pct, net_sales
_NO_SCHEDULE_BLANK_FIELDS = {"total_amount_before_vat"}
# This money field is mandatory-and-blocking even when there's no real
# contract figure to compare against at all (e.g. Electricity/Water's
# no-schedule-counterpart case above) — per explicit instruction, "no backup
# document to verify" is a reason to block until someone resolves it, not a
# reason to let the invoice through. Every other core field keeps the
# default leniency (a blank contract side is informational, never blocks).
# (Tax Amount / Total Amount After VAT were also in this set in earlier
# rounds — both were removed from the Matching checklist entirely, see
# field_mapping.CORE_CROSS_VALIDATION_FIELDS.)
_ALWAYS_BLOCKING_FIELDS = {"total_amount_before_vat"}
# RATNA_INTAN only, per explicit instruction: this vendor (an individual,
# non-PKP landlord) genuinely charges no VAT at all — vat_gst/tax_rate are
# both null on the real invoice. Excluded from every schedule-derived
# fallback/override below so neither the Matching page nor Extraction
# Postprocessing ever fabricates a VAT breakdown this vendor doesn't have.
# tax_rate ("VAT Rate") is included for Extraction Postprocessing's own
# derived-fields list — it isn't a Matching-page checklist field, so it's
# simply never looked up there.
#
# total_amount_before_vat is deliberately NOT in this set (removed per
# explicit correction): the payment schedule's own Amount (Excl. Tax) figure
# used to assume an 11% VAT split that didn't apply to this vendor, but the
# schedule has since been corrected (VAT Amount = 0 on every installment,
# Amount (Excl. Tax) now genuinely equals the real gross rent) — it's a real,
# meaningful contract-side figure to compare Total Amount Before VAT against
# now, not a fabricated one.
_RATNA_INTAN_NO_VAT_FIELDS = {"vat_gst", "tax_rate"}

# RATNA_INTAN and PT_BANGUN, per explicit instruction: both vendors' real
# invoices state the VENDOR's own registered/personal address (an individual
# landlord's residence for RATNA_INTAN; a company's own business address, in
# a different building entirely, for PT_BANGUN) rather than the specific
# leased premises — both vendor_address and the contract's own
# premises_address are correct, real data individually, they just don't
# answer the same question. Comparing them as "Store Location" is a
# meaningless match for these two, so the invoice side is blanked and never
# mandatory, same treatment as billing period. Distinct from a mall-operator
# vendor (Palladium/Pakuwon/Karya Nastari), whose own registered address
# genuinely IS the mall the leased unit sits in — that comparison stays as-is
# for those.
_NO_STORE_LOCATION_MATCH_VENDORS = {"RATNA_INTAN", "PT_BANGUN", "DEBORA_KEMANG"}
def _has_no_schedule_charge(extracted: dict) -> bool:
    line_items = extracted.get("line_items") or []
    return any(item.get("charge_type") in _NO_SCHEDULE_CHARGE_TYPES for item in line_items)


def _format_finding_invoice_value(field: str, value, currency: Optional[str]) -> str:
    if field in ("tax_rate", "wht_rate"):
        # Stored as a whole percentage number (11, not 0.11) — see
        # payment_schedule.json/invoice_extraction.json's own convention.
        try:
            return f"{float(value):.1f}%"
        except (TypeError, ValueError):
            return str(value)
    if field in ("total_amount_before_vat", "vat_gst", "wht", "total_amount", "net_amount_after_wht"):
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
    extracted = _strip_na(extracted)
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
    Amount — see field_mapping.CORE_CROSS_VALIDATION_FIELDS) can never
    become "equal" to anything — it's never auto-resolved. A mandatory field
    with nothing to automatically verify against still needs an explicit
    human Acknowledge, not a silent pass-through."""
    field = f.get("field")
    if not field:
        return False
    if f.get("expected_value") is None:
        return False
    current = extracted.get(field)
    if current is not None and str(current) == str(f["expected_value"]):
        return True
    # Some core amount fields are never written back onto the invoice's own
    # extraction record — their "found" value instead falls back,
    # display-only, to the same matched-installment figure the "expected"
    # (contract) value shows (see _apply_mandatory_field_coverage).
    # When that fallback numerically equals the contract's own figure, the
    # two formatted display strings come out identical too — treat that the
    # same as a real extracted-data match, so this can never disagree with
    # the frontend's own isFindingResolved and permanently deadlock Approve.
    return f.get("found") is not None and f["found"] == f.get("expected")


# Total Amount Before VAT has no single flat contract field to compare
# against for a lumpsum-installment lease (that's what base_fee/"Monthly
# Rent" would be for a plain monthly rent contract) — the real per-installment
# figure lives in the payment schedule instead (see
# fixtures/dp/<KEY>/payment_schedule.json and the Contract Extraction
# Postprocessing stage, which reviews the same field before a contract is
# saved).
_INSTALLMENT_MATCH_FIELD_MAP = {
    "total_amount_before_vat": "amount_excl_tax",
    # Billing Period Start/End: Contract column only, by explicit instruction
    # — deliberately NOT added to _SCHEDULE_FIELD_MAP below, so the Invoice
    # column never falls back to this installment figure the way WHT/Net
    # Amount After WHT do. A real invoice that does state its own billing
    # period (e.g. Palladium's utility invoices) still shows it normally via
    # extracted.get(...) — this only suppresses the synthetic fallback.
    "billing_period_start": "billing_period_start",
    "billing_period_end": "billing_period_end",
}


def _schedule_row_category(description: str) -> str:
    """Group a payment-schedule row for the Matching page's installment picker.
    Derived from the row's own description rather than a fixture field, so no
    vendor's payment_schedule.json needs re-authoring; anything unrecognised
    falls back to "Rent", which is what a single-schedule vendor has."""
    d = (description or "").lower()
    if "service charge" in d:
        return "Service Charge"
    if "promotion" in d:
        return "Promotion Levy"
    if "deposit" in d:
        return "Deposit"
    # DEBORA_KEMANG runs two parallel monthly schedules — a revenue-share rent
    # and a flat IPL fee — so they need their own groups to be tellable apart in
    # the picker (both would otherwise fall through to "Rent").
    if "revenue share" in d:
        return "Revenue Share"
    if "ipl" in d:
        return "IPL Fee"
    return "Rent"


# Month names as they appear on these invoices, English and Indonesian both
# (PAKUWON prints "20 August 2025", PALLADIUM "01 Mei 2026", RATNA_INTAN
# "10 Agustus 2026", KARYA_NASTARI plain ISO).
_MONTH_NAMES = {
    "january": 1, "februari": 2, "february": 2, "januari": 1, "march": 3, "maret": 3,
    "april": 4, "may": 5, "mei": 5, "june": 6, "juni": 6, "july": 7, "juli": 7,
    "august": 8, "agustus": 8, "september": 9, "october": 10, "oktober": 10,
    "november": 11, "december": 12, "desember": 12,
}


def _parse_loose_date(value) -> Optional[datetime]:
    """Parse the handful of date shapes these fixtures actually use. Returns None
    for anything unrecognised (including "NA"), so callers simply skip the
    comparison rather than guessing."""
    if not isinstance(value, str):
        return None
    t = value.strip()
    if not t or t.upper() == "NA":
        return None
    try:
        return datetime.strptime(t, "%Y-%m-%d")
    except ValueError:
        pass
    parts = t.replace("-", " ").replace("/", " ").split()
    if len(parts) == 3:
        day, month, year = parts
        num = _MONTH_NAMES.get(month.lower())
        if num and day.isdigit() and year.isdigit():
            try:
                return datetime(int(year), num, int(day))
            except ValueError:
                return None
    return None


def _due_date_tiebreak(schedule: Optional[dict], extracted: dict) -> Optional[dict]:
    """Disambiguate rows that are equally close on amount by matching a date the
    invoice itself prints against the schedule row's due date.

    Amount alone cannot separate a schedule that repeats the same figure, e.g.
    PAKUWON's 3 down payments (all 30,000,000) and 24 monthly instalments (all
    15,000,000), so the automatic pick lands on the first of them regardless of
    which period the invoice is actually for. Only ever returns a row on an EXACT
    due-date match, so where the dates don't line up the existing pick stands."""
    installments = (schedule or {}).get("installments") or []
    # Two invoice-side dates can identify the period, tried in this order:
    #   1. the invoice's own due date (PAKUWON's case — its due dates coincide
    #      with the schedule's), then
    #   2. the start of the billing period the invoice prints (GRAHA_MEGARIA's
    #      case — it bills "Period From : 01-Aug-2026 to 31-Aug-2026" and each
    #      schedule row falls due on the first day of the month it covers,
    #      while the invoice's own due date is 3 weeks earlier).
    # Every other vendor's invoices leave billing_period_start as "NA", so
    # candidate 2 simply never fires for them.
    candidates = [_parse_loose_date(extracted.get("due_date")),
                  _parse_loose_date(extracted.get("billing_period_start"))]
    if not any(candidates) or len(installments) < 2:
        return None
    try:
        target = float(extracted.get("total_amount_before_vat"))
    except (TypeError, ValueError):
        return None

    scored = []
    for inst in installments:
        try:
            scored.append((abs(float(inst.get("amount_excl_tax")) - target), inst))
        except (TypeError, ValueError):
            continue
    if not scored:
        return None
    best = min(d for d, _ in scored)
    ties = [inst for d, inst in scored if abs(d - best) < 0.01]
    if len(ties) < 2:
        return None  # nothing ambiguous to break
    for inv_date in candidates:
        if not inv_date:
            continue
        exact = [i for i in ties if _parse_loose_date(i.get("due_date")) == inv_date]
        if len(exact) == 1:
            return exact[0]
    return None


def _matched_installment(doc: dict, schedule: Optional[dict], extracted: dict) -> Optional[dict]:
    """The installment this invoice is being matched against.

    A human's explicit pick (doc["installment_index"], set from the Matching
    page) always wins; otherwise fall back to amount proximity. The manual path
    matters because proximity cannot disambiguate rows that share an amount, and
    several vendors have many identical rows (PAKUWON has 24 identical monthly
    instalments and 3 identical down payments), so the automatic pick is often
    the wrong period even though the figure is right."""
    installments = (schedule or {}).get("installments") or []
    if not installments:
        return None
    idx = doc.get("installment_index")
    if isinstance(idx, int) and 0 <= idx < len(installments):
        return installments[idx]
    # Break an amount tie on the due date where that resolves it; otherwise the
    # plain amount-proximity pick stands unchanged.
    return _due_date_tiebreak(schedule, extracted) or _match_payment_installment(schedule, extracted)


def _schedule_option_label(description: str, index: int) -> str:
    """Just the row's own heading, for the Matching picker.

    The picker is narrow, so a full description truncates to uselessness
    ("Installment 1 of 10 (balance 80%) — ES..."). Two kinds of trailing text are
    dropped, both of which QUALIFY a row rather than IDENTIFY it:
      - parentheticals: "(balance 80%)", "(20%, cash upfront)", "(Year 1-2, upfront)"
      - the "— ESTIMATED" provenance marker

    What is deliberately NOT dropped is anything after an em dash generally —
    PAKUWON's "Promotion Levy — Month 1 of 36" and PALLADIUM's "Service Charge —
    Month 1 of 24" carry the distinguishing part there, and cutting at the dash
    would collapse 36 and 24 rows respectively into identical labels.

    The untrimmed description still shows in full in the Contract Derived Fields
    table, so the ESTIMATED provenance is never lost — only shortened here."""
    text = description or ""
    text = re.sub(r"\s*[—–-]\s*ESTIMATED\b", "", text)
    text = re.sub(r"\s*\([^)]*\)", "", text)
    text = re.sub(r"\s+", " ", text).strip(" —–-")
    return text or f"Installment {index + 1}"


def _schedule_options(schedule: Optional[dict]) -> list[dict]:
    """Installment rows offered in the Matching page's picker. One-time payments
    (deposits, telephone charges) are deliberately excluded: they are never what
    a recurring invoice is matched against."""
    return [
        {
            "index": i,
            "label": _schedule_option_label(inst.get("description") or "", i),
            "category": _schedule_row_category(inst.get("description") or ""),
            "due_date": inst.get("due_date"),
            "amount_excl_tax": inst.get("amount_excl_tax"),
        }
        for i, inst in enumerate((schedule or {}).get("installments") or [])
    ]


def _resolve_contract_value(core, contract_fields: dict, installment: Optional[dict]):
    if installment and core.invoice_field in _INSTALLMENT_MATCH_FIELD_MAP:
        return installment.get(_INSTALLMENT_MATCH_FIELD_MAP[core.invoice_field])
    contract_value = contract_fields.get(core.contract_field) if core.contract_field else None
    # base_fee (Monthly Rent) is literally 0 for a lumpsum-installment
    # contract with no true monthly-rent concept — that's "not
    # applicable", not "the expected amount is zero rupiah", so treat it
    # the same as no contract figure at all (blank, non-mandatory).
    if core.contract_field == "base_fee" and contract_value == 0:
        contract_value = None
    return contract_value


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
    extracted = _strip_na(extracted)
    contract_fields: dict = {}
    contract_doc: Optional[dict] = None
    contract_id = doc.get("contract_id")
    if contract_id:
        contract_doc = await dp_contract_runs(db).find_one({"_id": contract_id})
        if contract_doc:
            contract_fields = _strip_na(_merge(contract_doc.get("base_fields") or {}, contract_doc.get("edited_fields")))

    from .stp import get_dp_total_before_vat_threshold  # local import — stp.py never imports service.py's endpoints back
    vat_threshold = await get_dp_total_before_vat_threshold(db)

    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    schedule = _effective_payment_schedule(bundle.payment_schedule if bundle else None, contract_doc)
    installment = _matched_installment(doc, schedule, extracted)

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
        # A mandatory field that has been positively CLEARED by a real rule
        # (rather than by being equal, or by a human acknowledging it). Lets a
        # field stay mandatory — Total Amount Before VAT always is — while a
        # threshold pass still lets approval through, instead of the field
        # having to be demoted to non-mandatory to unblock. See has_open_issues.
        satisfied = False
        ratna_no_vat = doc.get("fixture_key") == "RATNA_INTAN" and core.invoice_field in _RATNA_INTAN_NO_VAT_FIELDS
        # See _NO_STORE_LOCATION_MATCH_VENDORS above.
        no_store_match = (
            doc.get("fixture_key") in _NO_STORE_LOCATION_MATCH_VENDORS and core.invoice_field == "vendor_address"
        )
        contract_value = _resolve_contract_value(core, contract_fields, installment)
        # Electricity/Water only, per explicit instruction: _resolve_contract_value
        # would otherwise return the "closest" installment's figure (always
        # Service Charge — Month 1, since it's numerically nearer than any
        # Rent installment) — a real number, but not a real comparison, since
        # no schedule category exists for these charge types at all (the
        # contract itself only says "billed on actuals"). A supporting
        # document persisted onto this run at extract time (see
        # extract_invoice/fixtures.py's DpDocumentEntry.supporting_document)
        # supplies the real actuals-based figure instead, when one exists —
        # the contract still governs the billing RULE, the supporting
        # document just supplies the AMOUNT that rule produced. Falls back
        # to blank (more honest than a false match) when there's no
        # supporting document for this specific charge either.
        used_supporting_document = False
        if core.invoice_field in _NO_SCHEDULE_BLANK_FIELDS and _has_no_schedule_charge(extracted):
            supporting_value = (doc.get("supporting_document") or {}).get(core.invoice_field)
            if supporting_value is not None:
                contract_value = supporting_value
                used_supporting_document = True
            else:
                # No contract figure and no INDEPENDENT supporting document.
                # Deliberately NO Faktur Pajak fallback: an FP's Harga Jual is
                # derived from the vendor's own billing calculation, so matching
                # against it would only confirm the vendor is internally
                # consistent with itself — not that the amount is correct. Left
                # blank so the row fails and routes to manual review.
                contract_value = None
        # Revenue-share contracts (DEBORA_KEMANG): the rent due is
        # Revenue Share % x Net Sales, so neither the schedule row's own stored
        # amount nor the supporting document alone is the reference — see
        # _revenue_share_reference. Computed live from both, so editing either
        # the contract's % (Contract Postprocessing) or re-reading the sales
        # report moves this figure. Placed BEFORE the RATNA/no-schedule
        # overrides below and after the metered-utility branch above, so it only
        # ever affects an invoice that actually carries a revenue_share line.
        used_revenue_share = False
        revenue_share_pct = revenue_share_net_sales = None
        escalation_note = (
            _wht_gross_up_note(extracted, contract_fields, contract_value)
            if core.invoice_field == "total_amount_before_vat" else None
        )
        if core.invoice_field == "total_amount_before_vat" and _is_revenue_share_invoice(extracted):
            rs_amount, revenue_share_pct, revenue_share_net_sales = _revenue_share_reference(doc, installment)
            if rs_amount is not None:
                contract_value = rs_amount
                used_revenue_share = True
        # RATNA_INTAN's own no-VAT case (see _RATNA_INTAN_NO_VAT_FIELDS) — the
        # schedule's Amount (Excl. Tax)/VAT Amount don't apply to this vendor
        # at all, so there's genuinely nothing on the contract side either.
        if ratna_no_vat:
            contract_value = None
        invoice_value = extracted.get(core.invoice_field)
        # RATNA_INTAN only, per explicit instruction: its raw invoice values
        # for these amount fields are real but numerically diverge from the
        # contract's own payment schedule — Matching uses the
        # schedule-derived figure here instead of the invoice's own printed
        # one, display-only (never written back onto the invoice's own
        # extraction record). Every other vendor keeps the default
        # raw-value-first behavior in the fallback below untouched.
        # total_amount_before_vat/vat_gst are excluded (see ratna_no_vat
        # above) — this vendor has no VAT, so the invoice's own real value
        # (or genuine absence of one) is used instead of the schedule's
        # VAT-assuming figure.
        if (
            doc.get("fixture_key") == "RATNA_INTAN"
            and installment
            and core.invoice_field in _SCHEDULE_FIELD_MAP
            and not ratna_no_vat
        ):
            invoice_value = installment.get(_SCHEDULE_FIELD_MAP[core.invoice_field])
        # Fallback for a core amount field the invoice itself leaves blank
        # (e.g. total_amount_before_vat/vat_gst missing on a raw invoice) —
        # falls back, display-only, to the same matched-installment figure
        # Extraction Postprocessing showed (see _SCHEDULE_FIELD_MAP), without
        # ever writing it onto the invoice. total_amount is normally always
        # printed on the invoice itself, so this rarely applies to it.
        # Excluded for RATNA_INTAN's no-VAT fields — a genuinely null vat_gst
        # here means "no VAT applies", not "missing data to backfill".
        if invoice_value is None and installment and core.invoice_field in _SCHEDULE_FIELD_MAP and not ratna_no_vat:
            invoice_value = installment.get(_SCHEDULE_FIELD_MAP[core.invoice_field])
        if no_store_match:
            invoice_value = None
        # Always shown, even with nothing on either side — a blank row is
        # itself the answer, not something to hide.
        if contract_value is None and core.invoice_field in _ALWAYS_BLOCKING_FIELDS:
            # Unlike every other core field, these 3 stay mandatory/blocking
            # even with nothing on the contract side to compare against —
            # see _ALWAYS_BLOCKING_FIELDS. No ACK is offered either way
            # (expected_value is None here, and MatchingTable.tsx's
            # NO_ACK_FIELDS excludes these regardless), so this can only
            # resolve once the underlying data actually provides a real
            # contract figure.
            severity = "error"
            if core.invoice_field in _NO_SCHEDULE_BLANK_FIELDS and _has_no_schedule_charge(extracted):
                # A metered/billed-on-actuals charge is never compared against a
                # contract figure — the contract only states the billing RULE —
                # so naming the contract here would point the reviewer at the
                # wrong document. What's missing is the supporting document.
                detail = (
                    f"This utility is billed on actuals, so {core.label} is compared against a supporting "
                    "document — none is attached, so this must be resolved before proceeding."
                )
            else:
                detail = f"No contract figure to compare {core.label} against — this must be resolved before proceeding."
            mandatory = True
        elif contract_value is None:
            # Nothing to auto-verify against — not "wrong" (that's what
            # error/red means), just unconfirmed. Never blocks approval and
            # never shows an Acknowledge action (there's nothing to
            # acknowledge — the frontend only offers ACK where a real
            # contract-side value exists to compare against, expected_value
            # not None), just an informational amber row.
            severity = "warning"
            detail = f"No contract figure to compare {core.label} against — please confirm manually."
            mandatory = False
        elif core.invoice_field in ("billing_period_start", "billing_period_end") and invoice_value is None:
            # The invoice never states its own billing period for a
            # lumpsum-installment lease (see _INSTALLMENT_MATCH_FIELD_MAP) —
            # this is expected, not a data gap, so the wording shouldn't read
            # like something's missing.
            severity = "warning"
            detail = f"Not stated on the invoice — shown for reference against the matched installment's own {core.label.lower()}."
            mandatory = False
        elif no_store_match:
            severity = "warning"
            detail = (
                "The invoice states the vendor's own registered/business address, not a specific store "
                "location — not a meaningful comparison against the contract's premises address."
            )
            mandatory = False
        elif (
            core.invoice_field == "total_amount_before_vat"
            and vat_threshold["enabled"]
            and contract_value is not None
            and invoice_value is not None
        ):
            # User-configurable tolerance check (Matching page control) —
            # allows the invoice to run up to threshold_pct ABOVE the
            # contract figure, instead of requiring an exact match. Checked
            # BEFORE the non-rent-invoice diff branch below on purpose: once
            # enabled, the threshold is the authoritative check for this
            # field regardless of invoice type (plain rent or a Service
            # Charge/Electricity/Water invoice like Palladium's). Disabled by
            # default; when disabled this branch is never reached and
            # behavior is identical to the branches below.
            threshold_pct = vat_threshold["threshold_pct"]
            try:
                contract_f = float(contract_value)
                invoice_f = float(invoice_value)
                max_allowed = contract_f * (1 + threshold_pct / 100)
                within_threshold = invoice_f <= max_allowed
            except (TypeError, ValueError):
                within_threshold = None
            if within_threshold is None:
                severity = "error" if core.mandatory else "warning"
                mandatory = core.mandatory
                detail = f"Compares the invoice's {core.label} against the contract."
            else:
                max_allowed_formatted = _format_finding_invoice_value(core.invoice_field, max_allowed, currency)
                # Billed-on-actuals charges (Electricity/Water) have no flat
                # contract figure at all — the reference amount here comes
                # from the supporting document instead (see
                # used_supporting_document above), so the wording shouldn't
                # imply a "contract amount" that doesn't exist for this row.
                reference_label = (
                    "supporting document amount" if used_supporting_document
                    else "revenue share due" if used_revenue_share
                    else "contract amount"
                )
                if within_threshold:
                    severity = "info"
                    # Mandatory either way (the field is never optional) — the
                    # threshold pass satisfies it rather than demoting it.
                    mandatory = core.mandatory
                    satisfied = True
                    detail = (
                        f"Within the configured {threshold_pct:g}% threshold — invoice must not exceed "
                        f"{max_allowed_formatted} ({reference_label} + {threshold_pct:g}%)."
                    )
                else:
                    severity = "error"
                    mandatory = True
                    detail = (
                        f"Exceeds the configured {threshold_pct:g}% threshold — invoice must not exceed "
                        f"{max_allowed_formatted} ({reference_label} + {threshold_pct:g}%)."
                    )
        elif (
            core.invoice_field in _INSTALLMENT_MATCH_FIELD_MAP
            and invoice_value is not None
            and _is_non_rent_invoice(extracted)
        ):
            # Service Charge/Electricity/Water (Palladium's case) don't tie
            # back to any real contract figure the way Rent does — surface
            # the actual delta plus why, instead of a bare "compares against
            # the contract" line that leaves the reader to subtract the two
            # numbers themselves and guess at the cause. Only reached for
            # total_amount_before_vat when the threshold check above is
            # disabled (see that branch's comment).
            try:
                diff = float(invoice_value) - float(contract_value)
            except (TypeError, ValueError):
                diff = None
            severity = "error" if core.mandatory else "warning"
            mandatory = core.mandatory
            if diff is not None and abs(diff) >= 0.01:
                diff_formatted = _format_finding_invoice_value(core.invoice_field, abs(diff), currency)
                direction = "higher" if diff > 0 else "lower"
                if used_supporting_document:
                    # A real backup document DOES exist here (that's exactly
                    # what supplied contract_value) — the reasoning below is
                    # about consumption/rate drift, not a missing document.
                    detail = (
                        f"Invoice is {diff_formatted} {direction} than the supporting document's stated "
                        f"{core.label} — this is billed on actuals per the contract, so a difference here "
                        "means the invoice and supporting document disagree on the actual consumption/rate."
                    )
                else:
                    detail = (
                        f"Invoice is {diff_formatted} {direction} than the contract's payment schedule for "
                        f"{core.label} — likely a per-sq-ft/consumption rate change since the schedule was set; "
                        "no backup document available to verify."
                    )
            else:
                detail = f"Compares the invoice's {core.label} against the contract."
        else:
            severity = "error" if core.mandatory else "warning"
            detail = f"Compares the invoice's {core.label} against the contract."
            mandatory = core.mandatory
        annotated.append({
            "finding_id": f"CORE-{core.invoice_field}",
            "severity": severity,
            "title": f"{core.label} comparison",
            "detail": detail,
            "expected": _format_finding_invoice_value(core.invoice_field, contract_value, currency)
                if contract_value is not None else None,
            "found": _format_finding_invoice_value(core.invoice_field, invoice_value, currency)
                if invoice_value is not None else None,
            "field": core.invoice_field,
            "expected_value": contract_value,
            # Raw (unformatted) invoice-side counterpart of expected_value —
            # needed by anything that has to do arithmetic on the comparison
            # rather than just display it (the Matching page's variance bar).
            # Not simply extracted[field]: for the schedule-derived/override
            # cases above this is the value Matching actually compared.
            "found_value": invoice_value,
            "core": True,
            "mandatory": mandatory,
            "satisfied": satisfied,
            # Where the Contract-column value actually came from. "contract"
            # (the default, omitted-equivalent) means the contract/its payment
            # schedule; "supporting_document" means the contract only states
            # the billing RULE for this charge ("billed on actuals") and the
            # AMOUNT came from the invoice's supporting document instead —
            # surfaced as an ⓘ next to the value so that's transparent rather
            # than implicit. See used_supporting_document above.
            "expected_source": (
                "supporting_document" if used_supporting_document
                else "revenue_share" if used_revenue_share
                else "contract"
            ),
            # Extra context for the escalation email, when this row's failure has
            # a known explanation beyond "exceeds the threshold". Absent otherwise.
            **({"escalation_note": escalation_note} if escalation_note else {}),
            # Only present on a revenue-share row, so the Matching page can show
            # HOW the reference was derived rather than just the result.
            **({
                "revenue_share": {
                    "pct": revenue_share_pct,
                    "net_sales": revenue_share_net_sales,
                    "formatted_net_sales": _format_finding_invoice_value(
                        "total_amount_before_vat", revenue_share_net_sales, currency),
                }
            } if used_revenue_share else {}),
        })
    return annotated


def _effective_installment_index(doc: dict, bundle, contract_doc: Optional[dict], extracted: dict) -> Optional[int]:
    """Index of the payment-schedule row this invoice is matched against, or None
    when there isn't a meaningful one (no schedule, or a utility billed on
    actuals). Mirrors _matched_installment but returns the position, so the
    Matching page can show it as preselected."""
    if _has_no_schedule_charge(extracted):
        return None
    schedule = _effective_payment_schedule(bundle.payment_schedule if bundle else None, contract_doc)
    rows = (schedule or {}).get("installments") or []
    if not rows:
        return None
    inst = _matched_installment(doc, schedule, extracted)
    return rows.index(inst) if inst in rows else None


async def invoice_out(db, doc: dict) -> dict:
    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    matched_contract_doc = await _fetch_matched_contract_doc(db, doc)
    match_result = doc.get("match_result")
    findings = _refresh_findings_from_extracted((match_result or {}).get("findings") or [], extracted)
    findings = await _apply_mandatory_field_coverage(db, doc, findings, extracted)
    system_acknowledged = await _apply_dp_ack_memory(db, findings, extracted)

    # Raw Faktur Pajak data for this specific document, if this vendor folder
    # has one (see fixtures.py's documents.json, or a single-invoice folder's
    # own fp_extraction.json) — the dedicated get_faktur_pajak() is the real
    # comparison/acknowledge/approve surface (the Faktur Pajak stage page);
    # this is just a convenience peek for anything else that wants the raw data.
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    document = _document_entry(bundle, doc.get("document_key"))
    faktur_pajak = _resolve_faktur_pajak(bundle, document)

    return {
        "id": str(doc["_id"]),
        "fixture_key": doc.get("fixture_key"),
        "document_key": doc.get("document_key"),
        "file_name": doc.get("file_name"),
        "status": doc.get("status"),
        "contract_id": str(doc["contract_id"]) if doc.get("contract_id") else None,
        "extracted": extracted,
        # Per-field {bbox: {...}} for `extracted`'s own flat keys — a
        # multi-document vendor's own document (see documents.json) has its
        # own field_meta; a single-invoice folder falls back to the bundle's.
        # extracted itself is never touched by this — same
        # read-only-source-of-values convention as contract_field_meta.
        "field_meta": (document.field_meta if document else None) or (bundle.invoice_field_meta if bundle else {}),
        "faktur_pajak": faktur_pajak,
        # Whether THIS invoice actually has an fp_extraction stage to go back
        # to — a vendor like RATNA_INTAN has no Faktur Pajak document at all,
        # so the Matching page's own "back" button needs this to avoid
        # routing to a Faktur Pajak screen that never applied.
        "has_faktur_pajak": bool(faktur_pajak),
        # Whether a supporting-document PDF exists to link to (see the
        # /supporting-document/pdf route). Distinct from whether the run has
        # supporting-document DATA — the extraction can exist without the PDF.
        "has_supporting_document_pdf": bool(document and document.supporting_document_pdf_path),
        # Individually linkable Faktur Pajak PDFs when one invoice has several
        # (KARYA_NASTARI invoice_3's Admin Fee / Water / Electricity set).
        "faktur_pajak_documents": [
            {"index": i, "label": f["label"]}
            for i, f in enumerate(document.faktur_pajak_pdfs if document else [])
        ],
        "has_payment_schedule": bool(bundle and bundle.payment_schedule),
        # Matching's installment picker: the rows on offer, which one is in
        # effect, and whether that was a human's pick or the automatic
        # amount-proximity guess (see _matched_installment).
        "payment_schedule_options": _schedule_options(
            _effective_payment_schedule(bundle.payment_schedule if bundle else None, matched_contract_doc)
        ),
        # The manual pin (None when nobody has pinned one) ...
        "installment_index": doc.get("installment_index"),
        "installment_is_manual": isinstance(doc.get("installment_index"), int),
        # ... and the row actually IN EFFECT, which is what the picker shows as
        # preselected: the pin when set, otherwise the automatic amount match.
        # Suppressed for a utility invoice billed on actuals, where no schedule
        # row is a meaningful counterpart and _match_payment_installment would
        # only return the numerically nearest, misleading, row.
        "matched_installment_index": _effective_installment_index(doc, bundle, matched_contract_doc, extracted),
        "expected": (match_result or {}).get("expected"),
        "summary": (match_result or {}).get("summary"),
        "findings": findings,
        "original_findings": doc.get("original_findings"),
        "acknowledged_findings": doc.get("acknowledged_findings", []),
        "system_acknowledged_findings": system_acknowledged,
        "has_edit_history": bool(doc.get("edit_history")),
        "extraction_confirmed": bool(doc.get("extraction_confirmed")),
        "tag": doc.get("tag"),
        # "manual" (real multipart /invoices/upload) vs "trigger" (referenced
        # by file name via /ingestion/trigger-upload, single or batch) — same
        # distinction and naming as P2P's own pipeline_runs.source, which the
        # dashboard's SourceIcon/getSourceTypes key off of. Defaults to
        # "manual" for any run predating this field.
        "source": doc.get("source") or "manual",
        "notify_email": (doc.get("source_meta") or {}).get("sender"),
        "stp_state": doc.get("stp_state"),
        "stp_failure_reason": doc.get("stp_failure_reason"),
        # Emails actually sent about this invoice — kind/stage/recipient/thread.
        # Exposed so the notification history is observable (and testable)
        # rather than write-only; see _dp_notify.
        "notifications": doc.get("notifications") or [],
        # Documents pushed to the shared drive, with their Drive links — see
        # upload_dp_documents_to_drive.
        "drive_uploads": doc.get("drive_uploads") or [],
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
        # Positively cleared by a rule (e.g. inside the Total Amount Before VAT
        # tolerance) — mandatory, but not open.
        if f.get("satisfied"):
            continue
        if _is_finding_resolved(f, extracted):
            continue
        return True
    return False


# ── Contracts ──────────────────────────────────────────────────────────────────

async def upload_contract(
    db, filename: str, email: Optional[str] = None, tag: Optional[str] = None, source: str = "manual"
) -> dict:
    bundle = get_dp_loader().resolve(filename or "")
    if bundle is None:
        raise NotFoundError("No DirectPay fixture scenarios configured")

    # Same filename rule as invoices — the same file is the same contract,
    # whatever stage the existing one has reached.
    existing = await find_duplicate_by_filename(db, dp_contract_runs, filename)
    if existing:
        raise DuplicateInvoiceError(existing, filename)

    now = _now()
    doc = {
        "fixture_key": bundle.key,
        "file_name": filename,
        # A contract run only ever holds one file, so this always mirrors
        # file_name — kept so both collections present the same shape to the
        # shared find_duplicate_by_filename.
        "uploaded_file_names": [filename],
        "status": "review",
        # Same provenance/notification metadata the invoice side records, so both
        # trigger-upload endpoints accept and store the same payload (see
        # DpTriggerUploadRequest).
        "source": source,
        "notify_email": email,
        "tag": tag,
        "base_fields": bundle.contract_extraction,
        "edited_fields": None,
        # Per-row edits to the Extraction Postprocessing stage's derived
        # fields (see edit_contract_extraction_postprocessing) — the payment
        # schedule itself is shared fixture data, never mutated; edits live
        # here, keyed by stringified row index, and are merged on top at read
        # time (same base+edits-overlay pattern as edited_fields above).
        "postprocessing_overrides": {"installments": {}, "one_time_payments": {}},
        # Same audit trail shape/purpose as invoice docs' own edit_history —
        # see _diff_contract_fields_patch / _diff_contract_postprocessing_patch.
        "edit_history": [],
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


async def edit_contract(db, oid: ObjectId, fields: dict, user_email: str = "unknown") -> dict:
    doc = await get_contract_doc(db, oid)
    current = _merge(doc.get("base_fields") or {}, doc.get("edited_fields"))
    entries = _diff_contract_fields_patch(current, fields, user_email)
    edited = _merge(doc.get("edited_fields") or {}, fields)
    mongo_update: dict = {"$set": {"edited_fields": edited, "updated_at": _now()}}
    if entries:
        mongo_update["$push"] = {"edit_history": {"$each": entries}}
    await dp_contract_runs(db).update_one({"_id": oid}, mongo_update)
    # Re-fetch rather than hand-mutate the passed-in `doc`: the in-memory DB
    # returns live references, so `doc` may already reflect this update by
    # the time update_one returns (same gotcha _apply_extracted_patch's own
    # comment documents on the invoice side) — re-fetching is correct either
    # way and doesn't depend on that implementation detail.
    return contract_out(await get_contract_doc(db, oid))


async def approve_contract(db, oid: ObjectId, fields: Optional[dict], user_email: str = "unknown") -> dict:
    doc = await get_contract_doc(db, oid)
    current = _merge(doc.get("base_fields") or {}, doc.get("edited_fields"))
    entries = _diff_contract_fields_patch(current, fields or {}, user_email)
    edited = doc.get("edited_fields") or {}
    if fields:
        edited = _merge(edited, fields)
    # A lumpsum lease with a real payment schedule gets an extra review step
    # (Contract Extraction Postprocessing) before it's terminal — everything
    # else (no payment_schedule.json for this vendor) goes straight to
    # "saved", same as before this stage existed.
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    next_status = "postprocessing" if bundle and bundle.payment_schedule else "saved"
    mongo_update: dict = {"$set": {"edited_fields": edited, "status": next_status, "updated_at": _now()}}
    if entries:
        mongo_update["$push"] = {"edit_history": {"$each": entries}}
    await dp_contract_runs(db).update_one({"_id": oid}, mongo_update)
    # Re-fetch — see edit_contract's comment on why hand-mutating `doc` here
    # would double the pushed entries.
    return contract_out(await get_contract_doc(db, oid))


# ── Contract Extraction Postprocessing ─────────────────────────────────────────
# Review-only stage between Contract Review and the final Approve & Save,
# shown only when the vendor has a real payment_schedule.json (see
# fixtures.py) — surfaces the schedule's own per-installment figures so a
# reviewer can confirm them before they start driving invoice Matching (see
# _resolve_contract_value above, which pulls these same four fields for
# whichever installment an invoice's amount matches). Columns the real
# tracker's payment-schedule table carries for TRACKING an already-received
# invoice (Invoice Number, Invoice Received Date, Date of Payment, Amount
# Paid) are deliberately excluded — no invoice exists yet at contract-approval
# time, so those facts aren't knowable here.
_CONTRACT_DERIVED_COLUMNS = [
    ("due_date", "Due Date"),
    # Derived, not literally stated on any source document as a "billing
    # period" — computed from the contract's own real flat annual rate
    # (total_contract_value / term_months) against each installment's own
    # amount, anchored to the lease's actual_start. See conversation history
    # for the PT_BANGUN derivation (750M / 250M-per-year = 3 years, etc.).
    ("billing_period_start", "Billing Period Start"),
    ("billing_period_end", "Billing Period End"),
    ("amount_excl_tax", "Total Amount Before VAT"),
    ("vat_rate", "VAT Rate"),
    ("vat_amount", "Tax Amount"),
    ("total_amount_incl_tax", "Total Amount (Incl. VAT)"),
    ("wht_rate", "WHT Rate"),
    # WHT (Withholding Tax) and Net Amount After WHT (Total Amount Payable)
    # were removed from this review table per explicit instruction. The
    # underlying payment_schedule.json still carries wht_amount /
    # net_payment_to_lessor and Bill Posting still uses them (see
    # _bill_posting_out) — this only drops them from the Contract Extraction
    # Postprocessing display.
    ("payment_status", "Payment Status"),
]

# Only meaningful for a revenue-share contract (DEBORA_KEMANG): the rent due is
# Revenue Share % x Reported Net Sales rather than a stored flat amount, so both
# inputs have to be visible and editable here — this IS the "contract derived
# fields" the Matching page's revenue-share reference reads its % from. Appended
# only when the vendor's own schedule carries them, so no other vendor gains two
# permanently-NA columns.
_REVENUE_SHARE_DERIVED_COLUMNS = [
    ("revenue_share_pct", "Revenue Share %"),
    ("reported_net_sales", "Reported Net Sales"),
]


def _contract_derived_columns(installments: list) -> list:
    if any("revenue_share_pct" in (inst or {}) for inst in installments):
        # Placed directly before the amount they produce, so the row reads
        # left-to-right as the calculation: % x Net Sales = Total Before VAT.
        i = [c[0] for c in _CONTRACT_DERIVED_COLUMNS].index("amount_excl_tax")
        return _CONTRACT_DERIVED_COLUMNS[:i] + _REVENUE_SHARE_DERIVED_COLUMNS + _CONTRACT_DERIVED_COLUMNS[i:]
    return _CONTRACT_DERIVED_COLUMNS


def _format_contract_derived_value(key: str, value) -> str:
    if value is None:
        # "NA", not blank — the frontend still marks the cell with the same
        # yellow highlight the Extraction page's own Metadata table uses
        # (driven by the raw `value` field being null, not by this string),
        # so the highlight survives showing visible text here.
        return "NA"
    if key in ("vat_rate", "wht_rate", "revenue_share_pct"):
        # Stored as a whole percentage number (11, not 0.11) — same
        # convention as the contract's own flat vat_rate field.
        try:
            return f"{float(value):.0f}%"
        except (TypeError, ValueError):
            return str(value)
    if key in ("amount_excl_tax", "vat_amount", "total_amount_incl_tax", "wht_amount",
               "net_payment_to_lessor", "reported_net_sales"):
        try:
            return f"{float(value):,.2f}"
        except (TypeError, ValueError):
            return str(value)
    return str(value)


async def get_contract_extraction_postprocessing(db, oid: ObjectId) -> dict:
    doc = await get_contract_doc(db, oid)
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    schedule = bundle.payment_schedule if bundle else None
    installments = (schedule or {}).get("installments") or []
    one_time_raw = (schedule or {}).get("one_time_payments") or []
    fields = _merge(doc.get("base_fields") or {}, doc.get("edited_fields"))
    overrides = doc.get("postprocessing_overrides") or {}
    inst_overrides = overrides.get("installments") or {}
    otp_overrides = overrides.get("one_time_payments") or {}

    columns = _contract_derived_columns(installments)
    rows = [
        {
            "description": (merged := {**inst, **(inst_overrides.get(str(idx)) or {})}).get("description"),
            "fields": [
                {
                    "field_name": key,
                    "display_name": label,
                    "value": merged.get(key),
                    "formatted_value": _format_contract_derived_value(key, merged.get(key)),
                }
                for key, label in columns
            ],
        }
        for idx, inst in enumerate(installments)
    ]

    # Optional and schema-driven, not vendor-specific: a vendor's own
    # payment_schedule.json only has this key when its source tracker had a
    # real "ONE-TIME PAYMENTS" section (deposits, fit-out guarantee, etc.) —
    # these aren't recurring installments and are never matched against an
    # invoice, so they get their own flat rows instead of the per-installment
    # amount_excl_tax/VAT/WHT breakdown above.
    one_time_payments = [
        {
            "description": (merged_p := {**p, **(otp_overrides.get(str(idx)) or {})}).get("description"),
            "amount": merged_p.get("amount"),
            "formatted_amount": _format_contract_derived_value("amount_excl_tax", merged_p.get("amount")),
            "due_date_trigger": merged_p.get("due_date_trigger"),
            "status": merged_p.get("status"),
            "remarks": merged_p.get("remarks"),
        }
        for idx, p in enumerate(one_time_raw)
    ]

    return {
        "id": str(doc["_id"]),
        "status": doc.get("status"),
        "vendor_name": fields.get("vendor_name"),
        "has_payment_schedule": bool(schedule),
        # Same doc-level edit_history Contract Extraction's own
        # has_edit_history reads (see contract_out) — an edit made on either
        # stage shows up in the same "View Edit History" panel from both.
        "has_edit_history": bool(doc.get("edit_history")),
        "installments": rows,
        "one_time_payments": one_time_payments,
    }


async def edit_contract_extraction_postprocessing(
    db, oid: ObjectId, installments_patch: Optional[dict], one_time_payments_patch: Optional[dict],
    user_email: str = "unknown",
) -> dict:
    """Persists a reviewer's correction to a derived field (e.g. the
    schedule's own Amount Excl Tax was mistyped) — merged on top of the
    fixture's own payment schedule at read time (see
    get_contract_extraction_postprocessing), never mutating the shared
    fixture file itself, same base+edits-overlay pattern edit_contract uses
    for the flat contract fields. Diffed against the currently-effective
    (fixture + prior overrides) row so edit_history stays accurate across
    repeated edits to the same field, same semantics as
    _apply_extracted_patch on the invoice side."""
    doc = await get_contract_doc(db, oid)
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    schedule = bundle.payment_schedule if bundle else None
    raw_installments = (schedule or {}).get("installments") or []
    raw_one_time = (schedule or {}).get("one_time_payments") or []

    overrides = doc.get("postprocessing_overrides") or {"installments": {}, "one_time_payments": {}}
    inst_overrides = dict(overrides.get("installments") or {})
    otp_overrides = dict(overrides.get("one_time_payments") or {})

    current_installments = [{**inst, **(inst_overrides.get(str(idx)) or {})} for idx, inst in enumerate(raw_installments)]
    current_one_time = [{**p, **(otp_overrides.get(str(idx)) or {})} for idx, p in enumerate(raw_one_time)]
    entries = _diff_contract_postprocessing_patch(
        current_installments, current_one_time, installments_patch, one_time_payments_patch, user_email
    )

    for idx, patch in (installments_patch or {}).items():
        inst_overrides[idx] = {**(inst_overrides.get(idx) or {}), **patch}
    for idx, patch in (one_time_payments_patch or {}).items():
        otp_overrides[idx] = {**(otp_overrides.get(idx) or {}), **patch}
    overrides = {"installments": inst_overrides, "one_time_payments": otp_overrides}

    mongo_update: dict = {"$set": {"postprocessing_overrides": overrides, "updated_at": _now()}}
    if entries:
        mongo_update["$push"] = {"edit_history": {"$each": entries}}
    await dp_contract_runs(db).update_one({"_id": oid}, mongo_update)
    doc["postprocessing_overrides"] = overrides
    return await get_contract_extraction_postprocessing(db, oid)


async def approve_contract_extraction_postprocessing(db, oid: ObjectId) -> dict:
    doc = await get_contract_doc(db, oid)
    if doc.get("status") != "postprocessing":
        raise InvalidStateError("This contract is not at the Extraction Postprocessing stage")
    await dp_contract_runs(db).update_one(
        {"_id": oid}, {"$set": {"status": "saved", "updated_at": _now()}}
    )
    doc["status"] = "saved"
    return contract_out(doc)


async def get_contract_edit_history(db, oid: ObjectId) -> list[dict]:
    """Mirrors get_edit_history on the invoice side exactly — same doc-level
    edit_history array, same newest-first ordering, just against
    dp_contract_runs instead of dp_invoice_runs."""
    doc = await get_contract_doc(db, oid)
    entries = list(doc.get("edit_history") or [])

    def _iso(v):
        return v.isoformat() if hasattr(v, "isoformat") else v

    out = [{**e, "timestamp": _iso(e.get("timestamp"))} for e in entries]
    out.sort(key=lambda e: e["timestamp"], reverse=True)
    return out


# ── Invoices ───────────────────────────────────────────────────────────────────

async def get_invoice_doc(db, oid: ObjectId) -> dict:
    doc = await dp_invoice_runs(db).find_one({"_id": oid})
    if not doc:
        raise NotFoundError("Invoice not found")
    return doc


async def upload_invoice_documents(
    db, filename: str, email: Optional[str] = None, tag: Optional[str] = None, source: str = "manual"
) -> tuple[list[dict], list[dict]]:
    """Every run this upload should produce, plus any it refused as a duplicate.

    Returns (runs, duplicates). A duplicate is not an error here — see the
    comment at the loop below.

    Normally exactly one. But a vendor's real document can be a single file that
    physically contains SEVERAL of its invoices — GRAHA_MEGARIA's 6-page PDF holds
    four, two of them followed by their own supporting-document page — and that
    must fan out into one independently-processable run per invoice. Declared per
    vendor in documents.json's `combined_uploads` (see fixtures.DpCombinedUpload),
    so this is fixture-driven, not vendor-specific logic.

    Each run is created through the same _create_or_reuse_invoice_run() a
    single-file upload uses, so the invoice+Faktur-Pajak collapse still applies per
    document: uploading the combined file and then its 4 separate FP files (in
    either order) still yields exactly 4 runs."""
    loader = get_dp_loader()
    bundle, combined = loader.resolve_combined_upload(filename or "")
    if bundle is None:
        raise NotFoundError("No DirectPay fixture scenarios configured")

    # Duplicates are COLLECTED, not raised, so one already-seen invoice inside a
    # combined file doesn't stop the others being created. The caller decides what
    # to do with a request where everything was a duplicate.
    runs: list[dict] = []
    duplicates: list[dict] = []

    documents = []
    if combined:
        by_key = {d.key: d for d in bundle.documents}
        documents = [by_key[k] for k in combined.document_keys if k in by_key]
    else:
        _, document = loader.resolve_document(filename or "")
        documents = [document]

    for document in documents:
        try:
            runs.append(await _create_or_reuse_invoice_run(db, bundle, document, filename, email, tag, source))
        except DuplicateInvoiceError as dup:
            duplicates.append({"file_name": filename, **dup.to_payload()})

    return runs, duplicates


# A single-run `upload_invoice()` wrapper used to sit here. It had no callers —
# both endpoints go through upload_invoice_documents — and it couldn't survive
# duplicate detection honestly: with a (runs, duplicates) result there is no
# single run to hand back when the upload was refused as a duplicate. Removed
# rather than left returning something misleading.


# ── Duplicate detection ────────────────────────────────────────────────────────
# One rule, for invoices and contracts alike: the same FILE NAME is the same
# document. Processing status is irrelevant — status says which stage a document
# sits at, not whether we already have it — so a posted or rejected run blocks a
# re-upload exactly as an in-flight one does.
#
# This replaced a fingerprint over vendor / invoice number / service period /
# store location / amounts. Filename is what the requirement asks for and is
# simpler in every direction: nothing to compute, nothing to normalise, and it
# needs no extracted data, so the check works at upload time without reaching
# into the fixture for values the run doesn't have yet.


def _normalise_upload_name(filename: str) -> str:
    """Case and surrounding whitespace are not meaningful in a file name here."""
    return (filename or "").strip().lower()


async def find_duplicate_by_filename(db, collection, filename: str) -> Optional[dict]:
    """An existing run for this exact file, or None.

    Matches `uploaded_file_names` as well as `file_name`, because a run holds
    more than one file: `file_name` is the invoice's own PDF, while its Faktur
    Pajak and supporting documents arrive as separate uploads under their own
    names. Only the former was recorded before, so re-sending a companion after
    the run reached posted/rejected — where the in-flight branch in
    upload_invoice_documents no longer applies — matched nothing and started a
    phantom run whose file_name was a Faktur Pajak.
    """
    name = _normalise_upload_name(filename)
    if not name:
        return None
    cursor = collection(db).find({}).sort("created_at", 1)
    for doc in await cursor.to_list(length=1000):
        if _normalise_upload_name(doc.get("file_name")) == name:
            return doc
        if any(_normalise_upload_name(n) == name for n in (doc.get("uploaded_file_names") or [])):
            return doc
    return None


class DuplicateInvoiceError(Exception):
    """Raised when an upload is a file the system already holds."""

    def __init__(self, existing: dict, filename: str):
        extracted = _strip_na(_merge(existing.get("base_extracted") or {}, existing.get("edited_extracted")))
        self.existing_id = str(existing["_id"])
        self.existing_status = existing.get("status")
        self.existing_file_name = existing.get("file_name")
        self.file_name = filename
        self.vendor_name = extracted.get("vendor_name")
        self.invoice_number = extracted.get("invoice_number")
        self.message = f"{filename} has already been uploaded"
        super().__init__(self.message)

    def to_payload(self) -> dict:
        return {
            "duplicate": True,
            "message": self.message,
            "file_name": self.file_name,
            "existing_invoice_id": self.existing_id,
            "existing_status": self.existing_status,
            "existing_file_name": self.existing_file_name,
            "vendor_name": self.vendor_name,
            "invoice_number": self.invoice_number,
        }


def _uploaded_artefact(document, filename: str) -> str:
    """Which of an invoice's documents this upload actually is.

    A vendor's invoice, its Faktur Pajak and its supporting document all resolve
    to the SAME document_key, so the key alone can't tell them apart — but the
    duplicate rule has to. Re-sending the invoice itself is a duplicate;
    sending its Faktur Pajak afterwards is the second half of one submission.

    Decided by matching the uploaded name against the document's own companion
    file names, the same normalise-and-substring rule fixture resolution uses.
    """
    if document is None:
        return "invoice"
    from .fixtures import _normalise

    # Identify the invoice POSITIVELY — the aliases naming the document's own PDF
    # — rather than trying to spot companions by keyword. The alias vocabulary is
    # too varied for that: PALLADIUM's Faktur Pajak is "inv_fp_4", but DEBORA's
    # own invoice answers to "listrik", "ipl" and "electricity_retribusi", none of
    # which look like an invoice.
    #
    # The two error directions are not equally bad, which is why this leans this
    # way. Mistaking the invoice for a companion only permits a harmless
    # re-attach to an existing run (no new row, no reprocessing), and a posted
    # invoice is still caught by the filename check further down. Mistaking a
    # companion for the invoice would REFUSE a legitimate Faktur Pajak upload and
    # break the documented invoice+FP flow.
    norm = _normalise(filename or "")
    pdf_path = getattr(document, "pdf_path", None)
    stem = _normalise(pdf_path.stem) if pdf_path else _normalise(document.key or "")
    primary = {stem, stem.replace("invoice", "inv")} - {""}

    # Longest alias wins, the same rule resolve_document() resolves with —
    # "invoice_1" is a substring of "supporting_doc_invoice_1", so the more
    # specific alias has to take precedence.
    best, best_len = None, -1
    for alias in (getattr(document, "match", None) or []):
        n = _normalise(alias)
        if n and n in norm and len(n) > best_len:
            best, best_len = n, len(n)
    if best is None:
        return "invoice"
    return "invoice" if best in primary else "companion"


async def _create_or_reuse_invoice_run(
    db, bundle, document, filename: str,
    email: Optional[str] = None, tag: Optional[str] = None, source: str = "manual",
) -> dict:
    # A multi-invoice vendor folder's Faktur Pajak can be its own real,
    # separately-uploaded document (documents.json's faktur_pajak_pdf) that
    # resolves to the SAME document_key as its paired invoice — e.g.
    # PALLADIUM_INV_1.pdf and PALLADIUM_INV_FP_4.pdf both resolve to
    # document_key "invoice_1". Uploading it must attach to that existing
    # run, never create a second independent one for the same real-world
    # document (the FP's own data is already fully resolvable off the first
    # upload's document_key — a second upload teaches the system nothing new,
    # it would just be a duplicate dashboard row that also never resolves
    # a Faktur Pajak stage of its own).
    #
    # Scoped to a run that is still IN FLIGHT, newest first. A run that has
    # finished (TERMINAL_STATUSES — posted/rejected) no longer has a Faktur
    # Pajak stage to attach anything to, so re-uploading the pair after that
    # legitimately means "process this document again" and starts a fresh run.
    # Without this scope the lookup could not tell the FP partner of the run
    # just created from a deliberate re-run, so every later upload of either
    # file kept returning the very first run forever — even a posted one.
    artefact = _uploaded_artefact(document, filename)

    if document:
        cursor = dp_invoice_runs(db).find({
            "fixture_key": bundle.key,
            "document_key": document.key,
            "status": {"$nin": list(TERMINAL_STATUSES)},
        }).sort("created_at", -1)
        in_flight = await cursor.to_list(length=1)
        if in_flight:
            run = in_flight[0]
            seen = run.get("uploaded_artefacts") or []
            names = [_normalise_upload_name(n) for n in (run.get("uploaded_file_names") or [])]
            # The invoice's own PDF arriving a SECOND time is the duplicate this
            # feature is about. A companion (Faktur Pajak, supporting document)
            # arriving is the rest of one submission, in either order — an FP can
            # land first and the invoice after it, and that invoice is not a
            # duplicate because it had never been supplied.
            if artefact == "invoice" and artefact in seen:
                raise DuplicateInvoiceError(run, filename)
            # A companion is judged by NAME, not by the "companion" token: a
            # Faktur Pajak and a supporting document are both companions and
            # both belong here, but the same file twice is a duplicate like any
            # other.
            if artefact != "invoice" and _normalise_upload_name(filename) in names:
                raise DuplicateInvoiceError(run, filename)
            update: dict = {"uploaded_file_names": filename}
            if artefact not in seen:
                update["uploaded_artefacts"] = artefact
            await dp_invoice_runs(db).update_one({"_id": run["_id"]}, {"$push": update})
            return await invoice_out(db, await get_invoice_doc(db, run["_id"]))

    # Same file name as something we already hold -> duplicate. Checked here,
    # after the in-flight reuse above, so an invoice's Faktur Pajak (a DIFFERENT
    # file name) still attaches to its run rather than being refused.
    existing = await find_duplicate_by_filename(db, dp_invoice_runs, filename)
    if existing:
        raise DuplicateInvoiceError(existing, filename)

    now = _now()
    doc = {
        "fixture_key": bundle.key,
        # Set only for a vendor folder with multiple real invoices (see
        # fixtures.py's documents.json) — which specific one this upload
        # resolved to. None for a single-invoice folder (unchanged behavior).
        "document_key": document.key if document else None,
        "file_name": filename,
        "status": "extraction",  # idle — matches kopi-demo: extraction hasn't run until /extract
        # Which of this invoice's documents have actually been uploaded. Lets a
        # re-sent invoice be told apart from its Faktur Pajak arriving — see
        # _uploaded_artefact.
        "uploaded_artefacts": [artefact],
        # Every file name this run has received, companions included. `file_name`
        # above only ever holds the invoice's own PDF, so this is what duplicate
        # detection matches a companion against — see find_duplicate_by_filename.
        "uploaded_file_names": [filename],
        "base_extracted": None,
        "edited_extracted": None,
        # Set only at extract time, and only for a document whose
        # documents.json entry carries one (Palladium's Electricity/Water —
        # see fixtures.py's DpDocumentEntry.supporting_document). Persisted
        # here rather than read live off the fixture bundle so Matching's
        # comparison is a stable snapshot like base_extracted/base_fields,
        # not something that could shift under an in-progress review.
        "supporting_document": None,
        # Human override for which schedule row this invoice is matched
        # against; None means fall back to amount proximity.
        "installment_index": None,
        "contract_id": None,
        "match_result": None,
        "original_findings": None,
        "acknowledged_findings": [],
        "fp_acknowledged_fields": [],
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
        # "manual" (real multipart /invoices/upload) vs "trigger"
        # (/ingestion/trigger-upload, single or batch) — drives the
        # dashboard's source icon (see invoice_out).
        "source": source,
        "source_meta": {"sender": email} if email else {},
        "created_at": now,
        "updated_at": now,
    }
    result = await dp_invoice_runs(db).insert_one(doc)
    doc["_id"] = result.inserted_id
    return await invoice_out(db, doc)


async def set_matched_installment(db, oid: ObjectId, installment_index: Optional[int]) -> dict:
    """Pin (or unpin, with None) which payment-schedule row this invoice is
    matched against. Everything downstream reads it through
    _matched_installment, so Matching, Bill Posting and Simulate all follow."""
    doc = await get_invoice_doc(db, oid)
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    contract_doc = await _fetch_matched_contract_doc(db, doc)
    schedule = _effective_payment_schedule(bundle.payment_schedule if bundle else None, contract_doc)
    rows = (schedule or {}).get("installments") or []
    if installment_index is not None and not (0 <= installment_index < len(rows)):
        raise InvalidStateError("That installment does not exist on this contract's payment schedule")
    await dp_invoice_runs(db).update_one(
        {"_id": oid}, {"$set": {"installment_index": installment_index, "updated_at": _now()}}
    )
    return await invoice_out(db, await get_invoice_doc(db, oid))


async def list_invoices(db) -> list[dict]:
    cursor = dp_invoice_runs(db).find({}).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    return [await invoice_out(db, d) for d in docs]


def _document_entry(bundle, document_key: Optional[str]):
    """Look up the specific DpDocumentEntry a multi-invoice vendor folder's
    upload resolved to (see fixtures.py's documents.json). None when the
    folder has no manifest (single-invoice — the common case) or the key
    wasn't found."""
    if not bundle or not document_key:
        return None
    return next((d for d in bundle.documents if d.key == document_key), None)


async def extract_invoice(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    document = _document_entry(bundle, doc.get("document_key"))
    if document:
        extracted = document.invoice_extraction
    else:
        extracted = bundle.invoice_extraction if bundle else {}
    # Internal-only — no upload flow, no review UI (unlike Invoice/FP/
    # Contract extraction). None for every document that doesn't carry one.
    supporting_document = document.supporting_document if document else None

    # One-way stage advance, exactly like confirm_extraction's own: re-extracting
    # a run that has ALREADY moved past Extraction refreshes its extracted data
    # but must never drag its status backwards.
    #
    # This is reachable in normal use. dashboard.tsx's upload paths call
    # /extract unconditionally after an upload (review.tsx and fp-extraction.tsx
    # both guard on status == "extraction"; the dashboard does not), and
    # upload_invoice deliberately returns the SAME in-flight run when an
    # invoice or its Faktur Pajak is uploaded again. Re-uploading a pair whose
    # run had already reached Matching therefore reset it to "extracted", and
    # because its contract_id was set by then, get_contract_recommendation
    # short-circuited on "contract_already_set" and nothing ever put it back —
    # leaving Matching showing every check green while review_action rejected
    # the approval with "This invoice is not at the Matching stage".
    set_fields = {
        "base_extracted": extracted,
        "supporting_document": supporting_document,
        "updated_at": _now(),
    }
    if doc.get("status") == "extraction":
        set_fields["status"] = "extracted"

    await dp_invoice_runs(db).update_one({"_id": oid}, {"$set": set_fields})
    doc.update(set_fields)
    return await invoice_out(db, doc)


async def edit_invoice(db, oid: ObjectId, extracted_patch: Optional[dict], user_email: str = "unknown") -> dict:
    doc = await get_invoice_doc(db, oid)
    doc = await _apply_extracted_patch(db, oid, doc, extracted_patch, user_email)
    return await invoice_out(db, doc)


async def confirm_extraction(db, oid: ObjectId, extracted_patch: Optional[dict], user_email: str = "unknown") -> dict:
    doc = await get_invoice_doc(db, oid)
    doc = await _apply_extracted_patch(db, oid, doc, extracted_patch, user_email)

    # Explicit one-way flag for "a human has clicked Confirm Extraction at
    # least once" — the Extraction page's own isActionable needs this
    # directly rather than inferring it from `status`, because "extracted"
    # is reused for two different moments (fresh extraction, not yet
    # confirmed; and post-Faktur-Pajak, ready for Matching) and
    # `contract_id` isn't set until Matching, several stages later. Without
    # this flag the Extraction page would keep showing itself as still
    # actionable ("Confirm Extraction") after a human has already confirmed,
    # moved through Faktur Pajak, and come back here.
    await dp_invoice_runs(db).update_one({"_id": oid}, {"$set": {"extraction_confirmed": True}})
    doc["extraction_confirmed"] = True

    # Mirrors P2P's approve_stage: confirming extraction auto-advances an IDR
    # invoice past Extraction to "fp_extraction" if this vendor has a real
    # Faktur Pajak document (bundle.fp_extraction / document.faktur_pajak),
    # else it stays "extracted", ready for Matching directly — Extraction
    # Postprocessing (deriving due_date/WHT/net-amount from the payment
    # schedule) was a separate stage in an earlier round and was removed per
    # explicit instruction; Matching's own _apply_mandatory_field_coverage
    # already re-derives whatever it needs from the schedule at render time,
    # so nothing downstream depended on that stage actually running.
    # An invoice confirmed a second time after already moving past this
    # point is left alone, matching P2P's one-way, idempotent stage advance.
    extracted = _merge(doc.get("base_extracted") or {}, doc.get("edited_extracted"))
    is_idr = (extracted.get("currency") or "").strip().upper() == "IDR"
    if doc.get("status") == "extracted" and is_idr:
        bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
        document = _document_entry(bundle, doc.get("document_key"))
        has_fp = bool(_resolve_faktur_pajak(bundle, document))
        if has_fp:
            await dp_invoice_runs(db).update_one({"_id": oid}, {"$set": {"status": "fp_extraction", "updated_at": _now()}})
            doc["status"] = "fp_extraction"
            # Notification, Faktur Pajak stage — on ENTERING it, so the requester
            # hears about an FP mismatch at the point it arises rather than only
            # if Auto-Process happens to be on. Silent when the FP matches
            # cleanly, which is the common case.
            await _notify_if_action_required(db, oid, "faktur_pajak_mismatch")

    # Drive upload, trigger 1 of 2: an invoice with NO Faktur Pajak stage has all
    # its data settled the moment extraction is confirmed, so its documents go up
    # now. One WITH an FP waits — see approve_faktur_pajak — because the FP is
    # part of the same document set and its own stage can still change things.
    if doc.get("status") != "fp_extraction":
        await upload_dp_documents_to_drive(db, oid)

    return await invoice_out(db, doc)


# Total Amount Before VAT has no single flat contract field to compare
# against for a lumpsum-installment lease — the real per-installment figure
# lives in the payment schedule instead (fixtures/dp/<KEY>/
# payment_schedule.json), matched to an invoice by amount (the schedule has
# no invoice-identifying key of its own — matching on amount is the only
# signal available, same spirit as contract_recommendation.py's
# amount-scoring). Also used by Bill Posting for its own WHT-rate lookup.
_SCHEDULE_FIELD_MAP = {
    "due_date": "due_date",
    "total_amount_before_vat": "amount_excl_tax",
    "tax_rate": "vat_rate",
    "vat_gst": "vat_amount",
    "total_amount": "total_amount_incl_tax",
    "wht_rate": "wht_rate",
    "wht": "wht_amount",
    "net_amount_after_wht": "net_payment_to_lessor",
}


def _match_payment_installment(schedule: Optional[dict], extracted: dict) -> Optional[dict]:
    installments = (schedule or {}).get("installments") or []
    if not installments:
        return None
    target = extracted.get("total_amount_before_vat")
    try:
        target = float(target)
    except (TypeError, ValueError):
        return installments[0]
    best, best_diff = None, None
    for inst in installments:
        try:
            diff = abs(float(inst.get("amount_excl_tax")) - target)
        except (TypeError, ValueError):
            continue
        if best_diff is None or diff < best_diff:
            best, best_diff = inst, diff
    return best or installments[0]


def _effective_payment_schedule(schedule: Optional[dict], contract_doc: Optional[dict]) -> Optional[dict]:
    """Applies the matched contract's own Extraction Postprocessing edits
    (see edit_contract_extraction_postprocessing's postprocessing_overrides)
    on top of the fixture's raw payment schedule — same merge this stage's
    own get_contract_extraction_postprocessing does for display, applied
    here so Matching/Bill Posting compare against the reviewer-corrected
    figures too, not stale fixture data, once a contract is actually
    matched. Returns the schedule unchanged when there's no contract or no
    overrides on it."""
    if not schedule:
        return schedule
    overrides = (contract_doc or {}).get("postprocessing_overrides") or {}
    inst_overrides = overrides.get("installments") or {}
    otp_overrides = overrides.get("one_time_payments") or {}
    if not inst_overrides and not otp_overrides:
        return schedule
    installments = [
        {**inst, **(inst_overrides.get(str(idx)) or {})}
        for idx, inst in enumerate(schedule.get("installments") or [])
    ]
    one_time_payments = [
        {**p, **(otp_overrides.get(str(idx)) or {})}
        for idx, p in enumerate(schedule.get("one_time_payments") or [])
    ]
    return {**schedule, "installments": installments, "one_time_payments": one_time_payments}


# ── Faktur Pajak ─────────────────────────────────────────────────────────────
# Mirrors P2P's backend/src/api/v1/fp_extraction.py field-for-field: the FP
# document's own 4 comparable fields (fp_number is displayed standalone, never
# compared — P2P's invoice extraction has no counterpart for it either) are
# checked against the SAME invoice's own extraction, not the contract.

_FP_FIELD_DISPLAY = {
    "vendor_name": "Vendor Name (FP)",
    "customer_name": "Customer Name (FP)",
    "taxable_amount": "Taxable Amount (DPP)",
    "vat_amount": "VAT Amount (PPN)",
}
_FP_INVOICE_FIELD_MAP = {
    "vendor_name": "vendor_name",
    "customer_name": "customer_legal_entity",
    # DP's "total_amount_before_vat" is the same field CORE_CROSS_VALIDATION_FIELDS calls
    # "Total Amount Before VAT" — the analog of P2P's total_amount_before_vat,
    # which its own _INVOICE_FIELD_MAP compares taxable_amount against.
    "taxable_amount": "total_amount_before_vat",
    "vat_amount": "vat_gst",
}
# Taxable Amount (DPP) / VAT Amount (PPN) removed from the required set per
# explicit request — a mismatch on either is still shown (amber
# "optional-mismatch" row styling) but no longer needs Acknowledge and never
# blocks Approve. Vendor Name / Customer Name stay mandatory.
_FP_REQUIRED_FIELDS = {"vendor_name", "customer_name"}


def _resolve_faktur_pajak(bundle, document) -> Optional[dict]:
    """A multi-invoice vendor folder's per-document FP (see fixtures.py's
    documents.json) takes priority; a single-invoice folder falls back to its
    own bundle-level fp_extraction.json. The two are mutually exclusive per
    folder in practice, never layered."""
    if document and document.faktur_pajak:
        return document.faktur_pajak
    return bundle.fp_extraction if bundle else None


def _resolve_fp_field_meta(bundle, document) -> dict:
    """Same resolution rule as _resolve_faktur_pajak, for the per-field
    {bbox: {...}} lookup generated by generate_dp_invoice_bbox.py — searched
    against faktur_pajak_pdf_path for a multi-invoice document, or the
    invoice's own PDF for a single-invoice folder (see fixtures.py)."""
    if document and document.fp_field_meta:
        return document.fp_field_meta
    return bundle.fp_field_meta if bundle else {}


def _fp_values_match(fp_value, invoice_value) -> bool:
    if fp_value is None or invoice_value is None:
        return False
    try:
        return abs(float(fp_value) - float(invoice_value)) < 0.01
    except (TypeError, ValueError):
        return str(fp_value).strip().lower() == str(invoice_value).strip().lower()


async def get_faktur_pajak(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
    document = _document_entry(bundle, doc.get("document_key"))
    fp = _resolve_faktur_pajak(bundle, document)
    fp_field_meta = _resolve_fp_field_meta(bundle, document)
    acknowledged = list(doc.get("fp_acknowledged_fields") or [])
    acked_set = set(acknowledged)

    from .stp import get_dp_ack_threshold  # local import — stp.py never imports service.py's endpoints back
    threshold = await get_dp_ack_threshold(db)

    fields = []
    if fp:
        for field_name, label in _FP_FIELD_DISPLAY.items():
            fp_value = fp.get(field_name)
            invoice_value = extracted.get(_FP_INVOICE_FIELD_MAP[field_name])
            is_acked = field_name in acked_set
            # Same DP Acknowledge Threshold learned memory Matching findings
            # use (see record_dp_acknowledgement/_apply_dp_ack_memory) —
            # namespaced "fp_<field>" so an FP field never shares memory with
            # a same-named Matching checklist field (e.g. both have their own
            # unrelated "vendor_name").
            system_acked = (
                not is_acked
                and await _dp_ack_memory_count(db, f"fp_{field_name}", fp_value, invoice_value) >= threshold
            )
            fields.append({
                "field_name": field_name,
                "display_name": label,
                "fp_value": fp_value,
                "invoice_value": invoice_value,
                "match_status": "match" if _fp_values_match(fp_value, invoice_value) else "mismatch",
                "required": field_name in _FP_REQUIRED_FIELDS,
                "acknowledged": is_acked,
                "system_acknowledged": system_acked,
                # Where this value sits on the FP PDF (see fp_field_meta's own
                # docstring) — drives the same click-a-field-to-highlight
                # interaction the invoice/contract review screens already
                # have, on whichever PDF this stage is actually showing
                # (has_own_pdf below decides that).
                "bbox": (fp_field_meta.get(field_name) or {}).get("bbox"),
                # Optional per-field note from the fixture's own `ai_reasoning`
                # map, for a value that is DERIVED from the document rather than
                # transcribed off it (e.g. PAKUWON FP5's VAT, exempt under PP
                # 49/2022, so the printed figure is waived and 0.00 is charged).
                # Rendered as the AI-derived-value treatment so the derivation
                # is visible instead of silently replacing the printed number.
                "ai_reasoning": (fp.get("ai_reasoning") or {}).get(field_name),
            })

    return {
        "id": str(doc["_id"]),
        "status": doc.get("status"),
        "invoice_number": extracted.get("invoice_number"),
        "invoice_date": extracted.get("invoice_date"),
        "vendor_name": extracted.get("vendor_name"),
        "currency": extracted.get("currency"),
        "fp_number": fp.get("fp_number") if fp else None,
        "fp_number_bbox": (fp_field_meta.get("fp_number") or {}).get("bbox"),
        "has_fp_document": bool(fp),
        # Whether this document's FP was uploaded as its own separate PDF
        # (Palladium's invoice_fp_4/5/6.pdf) rather than being page 2 of the
        # same PDF as the invoice (PT_BANGUN's case) — the FP Extraction
        # page uses this to decide which PDF endpoint/page to show.
        "has_own_pdf": bool(document and document.faktur_pajak_pdf_path),
        "fields": fields,
        "acknowledged_fields": acknowledged,
    }


async def acknowledge_fp_field(db, oid: ObjectId, field_name: str, acknowledged: bool) -> list[str]:
    doc = await get_invoice_doc(db, oid)
    acked = list(doc.get("fp_acknowledged_fields") or [])
    is_fresh_ack = acknowledged and field_name not in acked
    if acknowledged and field_name not in acked:
        acked.append(field_name)
    elif not acknowledged and field_name in acked:
        acked.remove(field_name)
    await dp_invoice_runs(db).update_one(
        {"_id": oid}, {"$set": {"fp_acknowledged_fields": acked, "updated_at": _now()}}
    )

    # Learn this (FP field, fp-value) -> invoice-value pair, same DP
    # Acknowledge Threshold learned memory Matching's acknowledge_finding
    # feeds — this was previously missing entirely, so an FP mismatch never
    # got auto-blessed no matter how many times it was manually acknowledged.
    # Only on a fresh manual ACK (not a revert), matching acknowledge_finding's
    # own rule.
    if is_fresh_ack and field_name in _FP_INVOICE_FIELD_MAP:
        extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
        bundle = get_dp_loader().discover().get(doc.get("fixture_key"))
        document = _document_entry(bundle, doc.get("document_key"))
        fp = _resolve_faktur_pajak(bundle, document)
        if fp is not None:
            fp_value = fp.get(field_name)
            invoice_value = extracted.get(_FP_INVOICE_FIELD_MAP[field_name])
            await record_dp_acknowledgement(db, f"fp_{field_name}", fp_value, invoice_value)

    return acked


async def approve_faktur_pajak(db, oid: ObjectId, force: bool = False) -> dict:
    """Mirrors P2P's fp_extraction approve exactly in effect (advance to the
    next stage) — DP additionally enforces the required-field-mismatch block
    server-side (via the same NeedsConfirmationError/force-retry dance
    review_action already uses) rather than relying on the frontend disabling
    its own Approve button the way P2P's page does, since this module already
    established that stronger pattern for its Matching stage."""
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") != "fp_extraction":
        raise InvalidStateError("This invoice is not at the Faktur Pajak stage")

    fp_data = await get_faktur_pajak(db, oid)
    # MUST stay identical to fp-extraction.tsx's own `blockingFields` — when
    # these two drift the page shows "All fields matched / good to go" while
    # this gate still 409s, with nothing the user can click to resolve it.
    # Both extra conditions below were once only on the frontend and caused
    # exactly that:
    #   - system_acknowledged: pre-blessed by the DP Acknowledge Threshold's
    #     learned memory (the purple "Auto-approved" badge) — already handled.
    #   - a blank invoice-side value: there is nothing to acknowledge about a
    #     field the invoice never stated, and no ACK is offered for it.
    blocking = [
        f for f in fp_data["fields"]
        if f["required"]
        and f["match_status"] == "mismatch"
        and not f["acknowledged"]
        and not f.get("system_acknowledged")
        and f.get("invoice_value") not in (None, "")
    ]
    if blocking and not force:
        raise NeedsConfirmationError()

    # Advances straight to "extracted", ready for Matching — Extraction
    # Postprocessing used to sit here as a separate review stage but was
    # removed per explicit instruction (see confirm_extraction).
    await dp_invoice_runs(db).update_one(
        {"_id": oid}, {"$set": {"status": "extracted", "updated_at": _now()}}
    )
    doc["status"] = "extracted"

    # Drive upload, trigger 2 of 2: the Faktur Pajak is settled, so the whole
    # document set (invoice + FP + any supporting document) goes up together.
    await upload_dp_documents_to_drive(db, oid)

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
    # Notification, Matching stage. Hooked to the TRANSITION into matching, not
    # to reading the Matching screen: findings are recomputed on every GET, so
    # notifying from there would fire again each time somebody merely opened the
    # invoice. _dp_notify's per-(kind, stage) idempotency makes a re-match onto a
    # different contract silent too, which is right — it is the same stage and the
    # same conversation, not a second thing to act on.
    #
    # Auto-Process runs reach the identical notification through stp.py's hold, so
    # both modes now tell the requester the same thing at the same point.
    await _notify_if_action_required(db, oid, "matching_open_issues")
    return await invoice_out(db, doc)


async def _notify_if_action_required(db, oid: ObjectId, reason: str) -> None:
    """Send the action-required notification only if something actually needs
    acknowledging, and never let a notification failure break the caller.

    notify_dp_action_required composes the message from whatever is outstanding;
    asking it to send when nothing is outstanding would produce an email with an
    empty list, so the emptiness check belongs here, once, rather than in each
    stage's own hook.
    """
    import logging
    try:
        if not await _has_action_required(db, oid, reason):
            return
        await notify_dp_action_required(db, oid, reason)
    except Exception:
        logging.getLogger(__name__).exception(
            "DirectPay: %s notification failed for run %s", reason, oid
        )


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


async def review_action(db, oid: ObjectId, action: str, reason: Optional[str]) -> dict:
    """Matching-stage decision. There is no "accept"/"validate" split and no
    "validated" terminal status — approving here is a mid-pipeline transition
    (matching -> bill_posting), same as P2P's line_item_matching approval
    moves the invoice on to bill_posting rather than ending the pipeline.

    Every mandatory field check (see _apply_mandatory_field_coverage) must be
    resolved or acknowledged before approving — this is a hard rule with no
    override: unlike Faktur Pajak's approve (which does take a `force` to
    let a human proceed past its own mismatches), Matching's mandatory
    checklist can never be bypassed, only fixed or acknowledged."""
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
    if has_open_issues(findings, acknowledged, system_acknowledged, extracted):
        raise NeedsConfirmationError()

    review = {
        "status": "approved",
        "accepted_with_issues": False,
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

def _bill_posting_out(doc: dict, contract_doc: Optional[dict] = None, bundles: Optional[dict] = None) -> dict:
    """`bundles` lets a caller listing MANY runs resolve the fixture set once and
    pass it in — discover() re-reads the whole fixtures directory from disk on
    every call, so per-row resolution is a per-row disk scan (see list_tracker).
    Omit it and this resolves its own, exactly as before."""
    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    bundle = (bundles if bundles is not None else get_dp_loader().discover()).get(doc["fixture_key"])
    defaults = (bundle.bill_posting if bundle else {}) or {}
    default_items = defaults.get("line_items") or []
    overrides = doc.get("bill_posting_overrides") or {}
    # RATNA_INTAN only, per explicit instruction: this vendor genuinely
    # charges no VAT at all (see _RATNA_INTAN_NO_VAT_FIELDS on the Matching
    # page) — no VAT Tax Code column/value applies to its line items either.
    is_ratna_intan = doc.get("fixture_key") == "RATNA_INTAN"

    # Defaults are matched to a line item BY CHARGE TYPE first, falling back to
    # the positional pairing this file has always used. Positional alone breaks
    # for a vendor whose several invoices each carry one line item of a DIFFERENT
    # charge type (GRAHA_MEGARIA bills Rent, Service Charge, Electricity and
    # Water as four separate invoices): every one of them reads default_items[0]
    # and so would post to the same G/L account. Purely additive — a fixture
    # whose defaults don't name the charge type keeps the old behaviour exactly.
    defaults_by_charge_type = {}
    for d in default_items:
        ct = d.get("charge_type")
        if ct:
            defaults_by_charge_type.setdefault(ct, d)

    line_items = []
    for idx, item in enumerate(extracted.get("line_items") or []):
        # A WHT-deduction line (e.g. RATNA_INTAN's own "Pemotongan PPH" row)
        # is real data on the invoice, but it isn't a billable/GL-codeable
        # charge — it's the same deduction the dedicated WHT figures
        # (wht_amount / payable_amount above, and Simulate's own WHT-Payable
        # row) already represent. Showing it here too would double it up —
        # once as this raw line, once as the synthesized WHT row.
        #
        # Stamp duty (e.g. Palladium invoice_1's "MATERAI" row) is a fixed
        # government duty, not a billable/GL-codeable service charge — no
        # real VAT/WHT tax code applies to it (per explicit instruction),
        # so it's excluded from Bill Posting's line items the same way.
        # Denda (late-payment charge) is real money owed and appears on the
        # billing statement, but it is not a taxable supply and has no Faktur
        # Pajak counterpart — so it gets no VAT/WHT code and is excluded here,
        # then added back by Simulate as its own dedicated debit row (exactly
        # how stamp duty is handled) so Debit still equals Credit.
        if item.get("charge_type") in ("wht_deduction", "stamp_duty", "late_fee"):
            continue
        row_id = str(idx)
        item_defaults = (
            defaults_by_charge_type.get(item.get("charge_type"))
            or (default_items[idx] if idx < len(default_items) else {})
        )
        row_overrides = overrides.get(row_id) or {}
        line_items.append({
            "id": row_id,
            # DP's own DpLineItem schema calls this "label", not "description"
            # (P2P's own field name) — reading the wrong key here always
            # returned null, so every row showed "—" in the table.
            "description": item.get("label"),
            "charge_type": item.get("charge_type") or item_defaults.get("charge_type"),
            "quantity": item.get("quantity"),
            "amount": item.get("amount"),
            "gl_account_code": row_overrides.get("gl_account_code", item_defaults.get("gl_account_code", "")),
            "vat_tax_code": "" if is_ratna_intan else row_overrides.get("vat_tax_code", item_defaults.get("vat_tax_code", "")),
            "wht_tax_code": row_overrides.get("wht_tax_code", item_defaults.get("wht_tax_code", "")),
        })

    # Excluded from line_items above (not billable/GL-codeable), but still
    # real money owed to the vendor — Simulate adds this back as its own
    # dedicated ledger row (no VAT/WHT code, same pattern as Input VAT/WHT
    # Payable) so Debit still equals Credit.
    stamp_duty_amount = sum(
        float(item.get("amount") or 0)
        for item in (extracted.get("line_items") or [])
        if item.get("charge_type") == "stamp_duty"
    )
    late_fee_amount = sum(
        float(item.get("amount") or 0)
        for item in (extracted.get("line_items") or [])
        if item.get("charge_type") == "late_fee"
    )

    # "Invoice Received Date" is a genuine system fact (when this run was
    # uploaded into DirectPay) rather than extracted invoice data — there is
    # no such field anywhere in the source tracker/PDF, so it will differ
    # across re-uploads/demo runs rather than reflect a fixed real-world date.
    created_at = doc.get("created_at")

    # wht / net_amount_after_wht are never printed on the invoice itself and
    # (per explicit instruction) never get back-populated into the invoice's
    # own extraction record either — extracted.get(...) is therefore always
    # None for these two. Bill Posting falls back here, display-only, to the
    # same matched-installment figures the Matching page shows (see
    # _apply_mandatory_field_coverage) so WHT isn't silently dropped from the
    # simulated posting and "Payable Amount" isn't silently left as the gross
    # total instead of the true net-of-WHT figure.
    schedule = _effective_payment_schedule(bundle.payment_schedule if bundle else None, contract_doc)
    installment = _matched_installment(doc, schedule, extracted)
    wht_value = extracted.get("wht")
    if wht_value is None and installment:
        wht_value = installment.get("wht_amount")

    # "Payable Amount" is the actual cash amount owed to the vendor — after
    # WHT deduction when WHT applies (net_amount_after_wht), else the same as
    # the gross total (grand_total) since there's nothing to deduct. Computed
    # as THIS invoice's own real total minus wht_value (whether wht_value is
    # real or the installment fallback above) — never borrowed directly as
    # the matched installment's own net_payment_to_lessor, which is a
    # different invoice's/period's total and can diverge from this one (e.g.
    # PALLADIUM's real per-sqm rate differs slightly from the schedule's
    # assumed rate) even when both happen to have zero WHT.
    payable_amount = extracted.get("net_amount_after_wht")
    if payable_amount is None:
        total_amount = extracted.get("total_amount")
        if total_amount is not None and wht_value is not None:
            payable_amount = float(total_amount) - float(wht_value)
        elif installment:
            payable_amount = installment.get("net_payment_to_lessor")
    if payable_amount is None:
        payable_amount = extracted.get("total_amount")

    subtotal = extracted.get("total_amount_before_vat")
    tax_amount = extracted.get("vat_gst")

    # RATNA_INTAN only, per explicit instruction: same divergence already
    # reconciled on the Matching page (its raw invoice amounts are real but
    # numerically diverge from the contract's own payment schedule) — Bill
    # Posting/Simulate use the schedule-derived figures here instead of the
    # invoice's own printed ones, display-only (never written back onto the
    # invoice's own extraction record). Every other vendor keeps the
    # raw-value-first behavior above untouched.
    if doc.get("fixture_key") == "RATNA_INTAN" and installment:
        subtotal = installment.get("amount_excl_tax")
        tax_amount = installment.get("vat_amount")
        wht_value = installment.get("wht_amount")
        payable_amount = installment.get("net_payment_to_lessor")

    # ── Reviewer-selected WHT, from the line-item dropdown ─────────────────
    # VAT is derived from the invoice; WHT is normally derived from the contract.
    # Where the contract states no withholding at all there is nothing to derive
    # from, so the reviewer applies it by hand — and everything downstream
    # (metadata Taxable Amount, Simulate's credit line, Payable Amount) has to
    # follow that selection immediately. Nothing here is stored: the selection
    # lives in bill_posting_overrides, which the frontend only writes at "Post to
    # ERP", so these figures stay fully re-computable until then.
    # The withholding the DOCUMENTS themselves state, before any selection is
    # applied — None when neither the invoice nor the contract mentions one. Sent
    # to the frontend so its live preview can apply exactly the same rule as the
    # block below instead of trying to infer the baseline from an already-adjusted
    # figure.
    wht_from_document = wht_value
    selected_wht_rate = _selected_wht_rate(line_items)
    if selected_wht_rate is not None:
        if selected_wht_rate == 0:
            # "No Withholding" is an explicit answer, not a missing one, so it
            # zeroes whatever WHT the data would otherwise imply. This is what
            # makes reverting a 10% selection put Taxable Amount back exactly
            # where it started, with no trace of the intermediate state.
            wht_value = 0.0
        elif not wht_value and subtotal is not None:
            # The case this control exists for: nothing on the contract or the
            # invoice states a withholding, so the selected rate supplies it. A
            # figure the document itself prints (PT_BANGUN, RATNA_INTAN and
            # DEBORA_KEMANG all do) is left alone rather than replaced by a
            # recomputation of itself.
            #
            # "Nothing stated" has to include an explicit ZERO, not just a missing
            # value: a contract with no WHT clause still yields wht_amount 0.0 on
            # every payment-schedule row (GRAHA_MEGARIA, PALLADIUM, PAKUWON,
            # KARYA_NASTARI), and those are exactly the vendors this manual
            # override exists for. Testing `is None` alone made the dropdown a
            # silent no-op for all four.
            wht_value = round(float(subtotal) * selected_wht_rate / 100.0, 2)
        # Payable Amount follows the selection ONLY when the invoice does not state
        # a net-of-withholding figure of its own.
        #
        # Where it does, that printed figure is authoritative and must not move —
        # DEBORA_KEMANG invoice 2 prints 15,000,000 and RATNA_INTAN 770,000,000.
        # Where it does not (PT_BANGUN, GRAHA_MEGARIA, DEBORA_KEMANG invoice 1 —
        # all "NA"), payable is gross minus whatever WHT is in effect, so a
        # computed or manually selected rate reduces it: DEBORA invoice 1 at 10%
        # is 21,759,425 - 2,175,942.50 = 19,583,482.50.
        #
        # This has to run AFTER the block above: the pre-existing computation
        # earlier in this function subtracts the pre-selection wht_value, which is
        # 0 for a revenue-share row, so on its own it left payable at the gross.
        if extracted.get("net_amount_after_wht") is None:
            gross = extracted.get("total_amount")
            if gross is None and subtotal is not None:
                gross = float(subtotal) + float(tax_amount or 0)
            if gross is not None:
                payable_amount = round(float(gross) - float(wht_value or 0), 2)

    installments = (schedule or {}).get("installments") or []
    matched_installment_index = installments.index(installment) if installment in installments else None

    return {
        "id": str(doc["_id"]),
        "status": doc.get("status"),
        "contract_id": str(doc["contract_id"]) if doc.get("contract_id") else None,
        "vendor_name": extracted.get("vendor_name"),
        "invoice_number": extracted.get("invoice_number"),
        "invoice_date": extracted.get("invoice_date"),
        "invoice_received_date": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
        "payment_due_date": extracted.get("due_date"),
        "bank_account_name": extracted.get("vendor_bank_account_name"),
        "bank_account_number": extracted.get("vendor_bank_account_number"),
        "currency": extracted.get("currency"),
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "wht_amount": wht_value,
        "wht_from_document": wht_from_document,
        # True when the invoice prints its own net-of-WHT figure, so the live
        # preview knows Payable Amount is fixed rather than derived.
        "payable_from_document": extracted.get("net_amount_after_wht") is not None,
        "wht_rate_selected": selected_wht_rate,
        "grand_total": extracted.get("total_amount"),
        "payable_amount": payable_amount,
        # A deliberate selection makes WHT applicable even for a vendor whose
        # contract says nothing about it — that is the whole point of the manual
        # override. Drives both Simulate's credit row and the metadata display.
        "wht_applicable": bool(defaults.get("wht_applicable", False)) or bool(selected_wht_rate),
        # Payment-schedule row in effect, for linking WHT to the contract's own
        # WHT Rate from the Bill Posting page.
        "matched_installment_index": matched_installment_index,
        # Drives hiding the VAT/GST Tax Code column on the Bill Posting page —
        # RATNA_INTAN only, see is_ratna_intan above. True for every other
        # vendor (no fixture currently opts a different vendor out of VAT).
        # Fixture-driven, defaulting to RATNA_INTAN's long-standing hardcode.
        # DEBORA_KEMANG is the second vendor with no VAT at all: an individual,
        # non-PKP landlord who issues no Faktur Pajak for either invoice, so no
        # VAT tax code applies and _validate_bill_posting_tax_codes must not
        # demand one.
        "vat_applicable": defaults.get("vat_applicable", not is_ratna_intan),
        "line_items": line_items,
        "stamp_duty_amount": stamp_duty_amount,
        "late_fee_amount": late_fee_amount,
        "erp": doc.get("erp"),
        "updated_at": doc.get("updated_at"),
    }


async def _fetch_matched_contract_doc(db, doc: dict) -> Optional[dict]:
    """The contract this invoice was matched against, if any — fetched fresh
    each call so Bill Posting always sees the contract's current Extraction
    Postprocessing overrides (see _effective_payment_schedule), not whatever
    they were at match time."""
    contract_id = doc.get("contract_id")
    if not contract_id:
        return None
    return await dp_contract_runs(db).find_one({"_id": contract_id})


async def get_bill_posting(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") not in ("bill_posting", "posted"):
        raise InvalidStateError("This invoice has not reached the Bill Posting stage")
    contract_doc = await _fetch_matched_contract_doc(db, doc)
    return _bill_posting_out(doc, contract_doc)


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


# The explicit "no withholding applies" code (see bill-posting.tsx's
# DP_WHT_OPTIONS / NO_WHT_CODE). A vendor not subject to WHT must carry THIS,
# not a real withholding code and not a blank — the WHT column is always
# shown, so "no withholding" has to be stated rather than implied.
_NO_WHT_CODE = "00"

# Rate behind each WHT code. MUST stay in sync with bill-posting.tsx's own
# WHT_RATES — same mirroring convention validateTaxCodes already follows for
# _validate_bill_posting_tax_codes. The rate lives here rather than being parsed
# out of the option label ("… SEWA TANAH DAN/ATAU BANGUNAN 10%"), which is
# display text and must not become a calculation input.
_WHT_CODE_RATES = {
    "PPH4(2)-SEWA": 10.0,
    _NO_WHT_CODE: 0.0,
    "": 0.0,
}


def _selected_wht_rate(line_items: list) -> Optional[float]:
    """The WHT rate the reviewer has selected for this invoice, or None when no
    line carries a code at all.

    Deliberately ONE rate per invoice, not per line: per explicit instruction the
    dropdown sets an invoice-level rate even though the control sits on each row
    (the frontend propagates a change to every line so what is displayed matches
    what is computed). The first coded line therefore decides it."""
    for it in line_items or []:
        code = (it.get("wht_tax_code") or "").strip()
        if code:
            return _WHT_CODE_RATES.get(code, 0.0)
    return None


def _validate_bill_posting_tax_codes(bp: dict) -> Optional[str]:
    """Reject a tax code that can't apply to this vendor, before anything is
    posted. Returns a human-readable message naming the field to fix, or None
    when everything is coherent.

    Both directions matter: a VAT code on a vendor that charges no VAT is as
    wrong as a missing one on a vendor that does, and likewise for WHT."""
    line_items = bp.get("line_items") or []
    if not line_items:
        return None

    vat_applicable = bp.get("vat_applicable", True)
    wht_applicable = bp.get("wht_applicable", False)

    def label(it: dict) -> str:
        return it.get("description") or it.get("charge_type") or f"line {it.get('id')}"

    for it in line_items:
        vat = (it.get("vat_tax_code") or "").strip()
        if vat_applicable and not vat:
            return (
                f"Select a VAT/GST Tax Code for “{label(it)}” before posting — "
                "this vendor is subject to VAT."
            )
        if not vat_applicable and vat:
            return (
                f"“{label(it)}” has VAT/GST Tax Code “{vat}”, but this vendor is not "
                "subject to VAT. Clear the VAT code before posting."
            )

    for it in line_items:
        wht = (it.get("wht_tax_code") or "").strip()
        if wht_applicable and (not wht or wht == _NO_WHT_CODE):
            return (
                f"Select the applicable WHT Tax Code for “{label(it)}” before posting — "
                "this vendor is subject to withholding tax."
            )
        # NOTE: there is deliberately no "selected but not applicable" rejection
        # for WHT any more. Applying a withholding by hand where the contract
        # states none is now an explicit, supported reviewer action (see
        # _selected_wht_rate), and bp["wht_applicable"] already reflects the
        # selection, so such a code can never reach here as "not applicable".
        # The VAT checks above keep both directions, and the "subject to WHT but
        # nothing selected" error above still stands.

    return None


async def post_bill(db, oid: ObjectId) -> dict:
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") != "bill_posting":
        raise InvalidStateError("This invoice is not at the Bill Posting stage")

    # Authoritative gate — the frontend also pre-checks so the user gets the
    # message without a round trip, but nothing posts without passing here.
    contract_doc = await _fetch_matched_contract_doc(db, doc)
    tax_error = _validate_bill_posting_tax_codes(_bill_posting_out(doc, contract_doc))
    if tax_error:
        raise InvalidStateError(tax_error)

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
    await _notify_dp_bill_posted(db, oid, doc, erp)
    return result


def _dp_ticket_id(doc: dict) -> Optional[str]:
    """The FreshDesk ticket this run's notifications belong to.

    A vendor emails vendor@neoflo.ai, FreshDesk raises a ticket, and VendorQuery
    polls it and starts the upload carrying that ticket id in the trigger-upload
    payload's `tag`. Every notification then replies on that ticket.

    None means send NOTHING — for every notification type, with no fallback to
    mailing anyone. A manual upload has no originating ticket, so there is no
    conversation to reply into and nobody who asked to be told.
    """
    tag = (doc.get("tag") or "").strip()
    if not tag:
        return None
    # Accept a bare id ("81234") or a decorated one ("ticket-81234", "FD#81234")
    # — VendorQuery sets this, and the exact shape isn't ours to dictate.
    digits = re.sub(r"\D+", "", tag)
    return digits or None


async def _dp_notify(db, oid: ObjectId, doc: dict, kind: str, stage: str, html: str) -> bool:
    """Post one notification as a reply on this run's FreshDesk ticket, at most
    once per (kind, stage).

    Three rules live here so no caller has to remember them:

    1. NO ticket, NO notification. See _dp_ticket_id — there is no fallback to
       emailing from sales@neoflo.ai; that path is retired.
    2. Idempotent per (kind, stage). The Auto-Process cascade is re-entrant
       (resume_dp_stp_if_enabled re-runs it whenever a human clears a hold), so
       without this the same hold would post again on every resume.
    3. Never fatal. A FreshDesk failure is logged and swallowed — posting a bill
       or holding a cascade must not depend on FreshDesk being reachable. The
       client already retries with backoff before giving up.

    Threading needs no work here: replies land on the ticket, so every
    notification for a run is one conversation by construction.
    """
    import logging
    ticket_id = _dp_ticket_id(doc)
    if not ticket_id:
        return False

    sent = doc.get("notifications") or []
    if any(n.get("kind") == kind and n.get("stage") == stage for n in sent):
        return False

    from ..services import freshdesk_client
    result = await freshdesk_client.reply_to_ticket(ticket_id, html)
    if not result.get("ok"):
        logging.getLogger(__name__).warning(
            "DirectPay %s notification not posted to ticket %s for invoice %s: %s",
            kind, ticket_id, oid, result,
        )
        return False

    await dp_invoice_runs(db).update_one(
        {"_id": oid},
        {"$push": {"notifications": {
            "kind": kind,
            "stage": stage,
            "ticket_id": ticket_id,
            "reply_id": result.get("reply_id"),
            "sent_at": _now(),
        }}},
    )
    logging.getLogger(__name__).info(
        "DirectPay %s notification posted to FreshDesk ticket %s for invoice %s",
        kind, ticket_id, oid,
    )
    return True


async def _notify_dp_bill_posted(db, oid: ObjectId, doc: dict, erp: dict) -> None:
    """Complete & valid: the invoice cleared every check and was posted.

    The scheduled payment date is the invoice's OWN printed due date. Where the
    document states none it stays absent rather than being computed from a
    payment term — `payment_terms` is the literal "NA" on 19 of 20 fixture
    invoices, so there is nothing to compute from, and a made-up date on a
    payment notification is worse than no date."""
    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    if not _dp_ticket_id(doc):
        return
    from ..services.email_templates import directpay_payment_scheduled_html

    contract_doc = await _fetch_matched_contract_doc(db, doc)
    bp = _bill_posting_out(doc, contract_doc)
    payable = bp.get("payable_amount")
    html = directpay_payment_scheduled_html(
        invoice_number=erp["bill_number"],
        vendor_name=extracted.get("vendor_name") or "",
        currency=bp.get("currency") or "",
        payable_amount=f"{float(payable):,.2f}" if payable is not None else "NA",
        posted_date=erp["posted_at"].strftime("%d %b %Y"),
        scheduled_payment_date=_dp_display_date(extracted.get("due_date")),
    )
    await _dp_notify(
        db, oid, doc, kind="posted", stage="bill_posting",
        html=html,
    )


# What each Auto-Process hold means, in words the recipient can act on. Keys are
# stp._cascade_dp_invoice's own reasons — keep in step with it.
_DP_HOLD_COPY: dict[str, tuple[str, str]] = {
    "faktur_pajak_mismatch": (
        "Faktur Pajak",
        "A required Faktur Pajak field does not match the invoice and needs to be acknowledged.",
    ),
    "no_contract_matched": (
        "Contract Matching",
        "No saved contract could be matched to this invoice with enough confidence. "
        "Upload the contract, or pick one manually.",
    ),
    "matching_open_issues": (
        "Matching",
        "One or more mandatory fields do not match the contract and need to be resolved or acknowledged.",
    ),
    "tax_code_invalid": (
        "Bill Posting",
        "The VAT/WHT tax codes selected for this invoice don't apply to this vendor.",
    ),
    "extraction_failed": ("Extraction", "Automated extraction could not complete for this invoice."),
    "incomplete": ("Processing", "Automated processing could not complete this invoice."),
}


async def notify_dp_action_required(db, oid: ObjectId, reason: str) -> None:
    """Incomplete / mismatched: this invoice needs a person before it can move on.

    Fired from BOTH modes, which is the whole point of the name change from
    notify_dp_auto_process_hold. It used to be wired only into the Auto-Process
    cascade's hold, so with Auto-Process off an invoice could sit at Matching with
    unacknowledged mismatches and nobody was ever told — the notification trail
    just stopped after the upload acknowledgement. The condition that matters is
    "acknowledgement needed", not "the cascade stopped"; whether a human or the
    cascade drove the invoice here is irrelevant to the person who has to act.

    Lists exactly the items that require a human ACKNOWLEDGEMENT — which is why
    `system_acknowledged` is filtered out. Those were auto-approved by the
    learned-ack memory (the DP Acknowledge Threshold), so nobody needs telling
    about a check the system already cleared itself.

    The two blocking predicates below deliberately mirror the ones that actually
    gate approval — has_open_issues for Matching, approve_faktur_pajak's own
    `blocking` list for Faktur Pajak — so this email can never name something
    that wouldn't have stopped the cascade, or stay silent about something that
    did.
    """
    doc = await get_invoice_doc(db, oid)
    if not _dp_ticket_id(doc):
        return

    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    stage_label, reason_label = _DP_HOLD_COPY.get(reason, ("Processing", "This invoice needs review."))
    discrepancies = await _action_required_discrepancies(db, oid, doc, reason, extracted)

    from ..services.email_templates import directpay_action_required_html
    html = directpay_action_required_html(
        invoice_number=extracted.get("invoice_number") or doc.get("file_name") or "—",
        vendor_name=extracted.get("vendor_name") or "—",
        stage_label=stage_label,
        reason_label=reason_label,
        discrepancies=discrepancies,
    )
    await _dp_notify(
        db, oid, doc, kind="action_required", stage=reason,
        html=html,
    )


async def _has_action_required(db, oid: ObjectId, reason: str) -> bool:
    """Whether this stage currently has anything awaiting acknowledgement."""
    doc = await get_invoice_doc(db, oid)
    if not _dp_ticket_id(doc):
        return False
    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    return bool(await _action_required_discrepancies(db, oid, doc, reason, extracted))


async def _action_required_discrepancies(
    db, oid: ObjectId, doc: dict, reason: str, extracted: dict,
) -> list[dict]:
    """The outstanding items for `reason`, as {label, found, expected[, note]}.

    Shared by the notification and by the "is anything outstanding?" test, so the
    two cannot disagree about what counts — a check that said "nothing to report"
    while the email listed three things would be worse than either alone.
    """
    discrepancies: list[dict] = []

    if reason == "faktur_pajak_mismatch":
        try:
            fp = await get_faktur_pajak(db, oid)
        except (NotFoundError, InvalidStateError):
            fp = None
        for f in ((fp or {}).get("fields") or []):
            if (
                f.get("required") and f.get("match_status") == "mismatch"
                and not f.get("acknowledged") and not f.get("system_acknowledged")
                and f.get("invoice_value") not in (None, "")
            ):
                discrepancies.append({
                    "label": f.get("display_name") or f.get("field_name"),
                    "found": f.get("invoice_value"),
                    "expected": f.get("fp_value"),
                })
    elif reason == "matching_open_issues":
        findings = _refresh_findings_from_extracted((doc.get("match_result") or {}).get("findings") or [], extracted)
        findings = await _apply_mandatory_field_coverage(db, doc, findings, extracted)
        system_acked = await _apply_dp_ack_memory(db, findings, extracted)
        handled = set(doc.get("acknowledged_findings") or []) | set(system_acked)
        for f in findings:
            if not f.get("mandatory") or f.get("finding_id") in handled:
                continue
            if f.get("satisfied") or _is_finding_resolved(f, extracted):
                continue
            discrepancies.append({
                "label": f.get("title") or f.get("field"),
                "found": f.get("found"),
                "expected": f.get("expected"),
                **({"note": f["escalation_note"]} if f.get("escalation_note") else {}),
            })

    return discrepancies


async def escalate_invoice(db, oid: ObjectId, note: Optional[str] = None) -> dict:
    """The Matching-stage Escalate action, for real.

    Composed entirely server-side from the run. The modal shows the reviewer the
    same content, but its version is NOT what gets sent: this endpoint mails as
    sales@neoflo.ai, and accepting a browser-supplied body would let any session
    send arbitrary email from that address. `note` — the reviewer's own words —
    is the only caller-supplied part, and it's rendered as a quoted block.

    Returns {"sent", "ticket_id", "reason"}. Three ways `sent` can be false, and
    the UI must tell them apart — reporting any of them as a success, or as each
    other, misleads the reviewer:
        no_ticket          no originating FreshDesk ticket; nothing is posted
        already_escalated  this invoice was escalated before; one is the limit
        send_failed        we tried and FreshDesk refused
    """
    doc = await get_invoice_doc(db, oid)
    ticket_id = _dp_ticket_id(doc)
    if not ticket_id:
        return {"sent": False, "ticket_id": None, "reason": "no_ticket"}

    # One escalation per invoice. Escalating is a hand-off — the invoice is now
    # awaiting someone else's decision — so a second one adds nothing and just
    # re-mails the same request. The UI disables the button off this same record,
    # and this is the authoritative check behind it.
    if any(n.get("kind") == "escalation" for n in (doc.get("notifications") or [])):
        return {"sent": False, "ticket_id": ticket_id, "reason": "already_escalated"}

    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    findings = _refresh_findings_from_extracted((doc.get("match_result") or {}).get("findings") or [], extracted)
    findings = await _apply_mandatory_field_coverage(db, doc, findings, extracted)
    # The same finding the Escalate button is offered for — match.tsx opens the
    # modal off this one (see its totalBeforeVatFinding).
    finding = next((f for f in findings if f.get("field") == "total_amount_before_vat"), None)

    # Local import: stp.py imports this module, so a top-level import here would
    # be circular.
    from .stp import get_dp_total_before_vat_threshold
    threshold = await get_dp_total_before_vat_threshold(db)

    from ..services.email_templates import directpay_escalation_html
    invoice_number = extracted.get("invoice_number") or doc.get("file_name") or "—"
    html = directpay_escalation_html(
        invoice_number=invoice_number,
        vendor_name=extracted.get("vendor_name") or "—",
        invoice_amount=str((finding or {}).get("found") or "—"),
        reference_amount=str((finding or {}).get("expected") or "—"),
        reference_label=(
            "Supporting document" if (finding or {}).get("expected_source") == "supporting_document"
            else "Revenue share" if (finding or {}).get("expected_source") == "revenue_share"
            else "Contract"
        ),
        tolerance=(
            f"{threshold['threshold_pct']}%" if threshold["enabled"]
            else "disabled — exact match required"
        ),
        reason=(finding or {}).get("detail") or "Total Amount Before VAT does not satisfy the configured tolerance.",
        notes=[(finding or {}).get("escalation_note")] if (finding or {}).get("escalation_note") else [],
        reviewer_note=(note or "").strip() or None,
    )
    sent = await _dp_notify(
        db, oid, doc, kind="escalation", stage="matching",
        html=html,
    )
    # "no recipient" and "we tried and it failed" must not look the same to the
    # UI — one is a legitimate no-op, the other is a problem the reviewer needs to
    # know about, and reporting a failure as a quiet success is worse than either.
    if sent:
        return {"sent": True, "ticket_id": ticket_id}
    return {"sent": False, "ticket_id": ticket_id, "reason": "send_failed"}


async def notify_dp_duplicate_rejected(db, duplicate: dict, tag: Optional[str]) -> None:
    """Tell the sender their upload was refused because we already hold that file.

    Replies on the ticket named by THIS upload's tag — which may be a different
    ticket from the one that first sent the file, so the reply goes where the
    latest request came from rather than to the original run's ticket.

    Can't go through _dp_notify: that keys idempotency off a run, and a refused
    duplicate has no run of its own.
    """
    import logging
    ticket_id = _dp_ticket_id({"tag": tag})
    if not ticket_id:
        return

    from ..services.email_templates import directpay_duplicate_rejected_html
    from ..services import freshdesk_client

    html = directpay_duplicate_rejected_html(
        invoice_number=duplicate.get("invoice_number") or "—",
        vendor_name=duplicate.get("vendor_name") or "—",
        uploaded_file_name=duplicate.get("file_name") or "—",
        existing_status=duplicate.get("existing_status") or "—",
        existing_file_name=duplicate.get("existing_file_name") or "—",
    )
    result = await freshdesk_client.reply_to_ticket(ticket_id, html)
    if result.get("ok"):
        logging.getLogger(__name__).info(
            "DirectPay duplicate notice posted to ticket %s (re-upload of %s)",
            ticket_id, duplicate.get("file_name"),
        )
    else:
        logging.getLogger(__name__).warning(
            "DirectPay duplicate notice not posted to ticket %s: %s", ticket_id, result
        )


# ── Drive upload ───────────────────────────────────────────────────────────────
# The documents to upload, already split out of any combined PDF and named to the
# [VendorName]_[InvoiceNo]_[DocType] convention, are pre-materialised on disk in
# fixtures/dp/drive_uploads/ with a manifest keyed by (fixture_key,
# document_key). Doing the splitting and naming there rather than here keeps this
# a straight file-to-Drive push, and means the exact set of files can be reviewed
# on disk before anything is sent.

_DRIVE_MANIFEST_CACHE: Optional[dict] = None


def _drive_uploads_dir():
    # Sits beside the vendor folders under the same fixtures root the loader
    # resolved, so it follows DP_FIXTURES_DIR and the Docker mount for free.
    return get_dp_loader().root / "drive_uploads"


def _drive_manifest() -> dict:
    """(fixture_key, document_key) -> the manifest entry for that invoice."""
    global _DRIVE_MANIFEST_CACHE
    if _DRIVE_MANIFEST_CACHE is not None:
        return _DRIVE_MANIFEST_CACHE

    index: dict = {}
    manifest = _drive_uploads_dir() / "manifest.json"
    if manifest.is_file():
        for entry in json.loads(manifest.read_text()):
            index[(entry["fixture_key"], entry.get("document_key"))] = entry
    _DRIVE_MANIFEST_CACHE = index
    return index


def _drive_documents_for(doc: dict) -> list[dict]:
    """Which files this run should upload. Empty when the fixture has no entry."""
    entry = _drive_manifest().get((doc.get("fixture_key"), doc.get("document_key")))
    if entry is None:
        # A single-invoice folder records document_key None; the manifest uses
        # the key "invoice" for those.
        entry = _drive_manifest().get((doc.get("fixture_key"), "invoice"))
    return (entry or {}).get("documents") or []


async def upload_dp_documents_to_drive(db, oid: ObjectId) -> dict:
    """Push this invoice's standardised documents to the shared drive.

    Called once the invoice's data is settled — after Confirm Extraction for an
    invoice with no Faktur Pajak, and after the Faktur Pajak is approved where
    there is one. Not earlier: the file names carry the vendor and invoice
    number, and a reviewer can still correct either on the extraction screen, so
    uploading sooner risks a name built from a value that's about to change.

    Idempotent on two levels — the run records what it has already sent, and each
    name is checked against the folder before uploading, because Drive happily
    accepts two files with the same name. That second check matters more than it
    looks: the in-memory DB resets on restart, so without it every restart would
    add another copy of everything. Never raises — a Drive outage must not block
    an invoice from being processed.
    """
    import logging
    log = logging.getLogger(__name__)

    from ..services import drive_client
    doc = await get_invoice_doc(db, oid)
    already = {u.get("file_name") for u in (doc.get("drive_uploads") or [])}
    wanted = _drive_documents_for(doc)

    if not wanted:
        return {"uploaded": 0, "skipped": 0, "reason": "no_manifest_entry"}
    if not drive_client.is_configured():
        # Not an error: the feature is simply off, or has no destination yet.
        return {"uploaded": 0, "skipped": len(wanted), "reason": "drive_not_configured"}

    root = _drive_uploads_dir()
    uploaded, skipped = [], 0
    for want in wanted:
        name = want["file"]
        if name in already:
            skipped += 1
            continue
        path = root / name
        if not path.is_file():
            log.warning("DirectPay Drive upload: %s missing from %s", name, root)
            skipped += 1
            continue
        existing = None
        try:
            existing = await drive_client.find_in_folder(name)
            if existing:
                # Already in the destination (a previous run, a manual copy).
                # Recorded so the run knows, but not re-sent — "no re-uploads"
                # applies to the folder, not just to our own bookkeeping.
                result = existing
            else:
                result = await drive_client.upload_pdf(name, path.read_bytes())
        except Exception:
            log.exception("DirectPay Drive upload failed for %s (invoice %s)", name, oid)
            skipped += 1
            continue
        uploaded.append({
            "doc_type": want.get("doc_type"),
            "file_name": name,
            "file_id": result.get("id"),
            "web_view_link": result.get("webViewLink"),
            "pre_existing": existing is not None,
            "uploaded_at": _now(),
        })

    if uploaded:
        await dp_invoice_runs(db).update_one(
            {"_id": oid}, {"$push": {"drive_uploads": {"$each": uploaded}}}
        )
        log.info("DirectPay Drive: %d document(s) handled for invoice %s", len(uploaded), oid)
    return {"uploaded": len(uploaded), "skipped": skipped}


def _dp_display_date(value) -> Optional[str]:
    """A printed date as the emails should show it: the document's own wording
    when it isn't parseable ("30 Juli 2026"), a tidied form when it is, and None
    for "NA"/absent so callers can omit the line entirely."""
    if not value or str(value).strip().upper() == "NA":
        return None
    parsed = _parse_loose_date(value)
    return parsed.strftime("%d %b %Y") if parsed else str(value).strip()


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


async def simulate_bill_posting(db, oid: ObjectId, pending_line_items: Optional[dict] = None) -> dict:
    """Preview the posting. `pending_line_items` carries the reviewer's UNSAVED
    line-item tax-code selections (row_id -> {vat_tax_code?, wht_tax_code?}),
    applied to an in-memory copy of the run only.

    Nothing about a WHT selection is written until "Post to ERP": the reviewer may
    switch the rate several times, and reverting to "No Withholding" has to leave
    no trace of the intermediate state. Simulate used to require the frontend to
    save the codes first, which broke exactly that guarantee."""
    doc = await get_invoice_doc(db, oid)
    if doc.get("status") not in ("bill_posting", "posted"):
        raise InvalidStateError("This invoice has not reached the Bill Posting stage")

    if pending_line_items:
        # Shallow-copy the run and deep-copy just the overrides map, so the
        # preview can never mutate the stored document (the in-memory DB hands
        # out live object references — see the store's own notes).
        merged = {k: dict(v) for k, v in (doc.get("bill_posting_overrides") or {}).items()}
        for row_id, patch in pending_line_items.items():
            merged.setdefault(str(row_id), {}).update(
                {k: v for k, v in (patch or {}).items() if v is not None}
            )
        doc = {**doc, "bill_posting_overrides": merged}

    extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
    bundle = get_dp_loader().discover().get(doc["fixture_key"])
    defaults = (bundle.bill_posting if bundle else {}) or {}
    contract_doc = await _fetch_matched_contract_doc(db, doc)
    bp = _bill_posting_out(doc, contract_doc)

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
    # is needed the way P2P's SAP-code system requires one. Never looked up
    # for RATNA_INTAN (no VAT applies — see is_ratna_intan below), since the
    # Input VAT row this label feeds is never emitted for that vendor either.
    tax_rate = extracted.get("tax_rate")
    is_ratna_intan = doc.get("fixture_key") == "RATNA_INTAN"

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
        line_debit = float(it.get("amount") or 0)
        # RATNA_INTAN only: its one billable line's raw amount is the
        # invoice's own incl-tax total (no separate VAT line printed on the
        # document) — posting it as-is here while ALSO adding the Input VAT
        # row below (now a real, schedule-derived amount instead of the
        # previous 0.00) would double-count VAT and leave Debit != Credit.
        # Use the schedule-derived excl-tax subtotal instead, same as
        # PT_BANGUN's own line item already is on its invoice (genuinely
        # excl-tax there, so this is a no-op for every other vendor).
        if is_ratna_intan:
            line_debit = subtotal
        rows.append({
            "position": pos,
            "posting_key": "40 · Debit",
            "account": f"{it.get('gl_account_code') or '5000'} · {it.get('charge_type') or 'Expense'}",
            "description": it.get("description") or it.get("charge_type") or "Line item",
            "tax_code": it.get("vat_tax_code") or "—",
            "debit": round(line_debit, 2),
            "credit": 0,
            "is_visible": True,
        })
        pos += 1

    # Stamp duty (e.g. Palladium invoice_1's "MATERAI") — excluded from
    # line_items above (not billable/GL-codeable, no real VAT/WHT code
    # applies), but still real money owed to the vendor and already included
    # in grand_total/net_payable on the credit side below — needs its own
    # debit row here or Debit would no longer equal Credit.
    late_fee_amount = float(bp.get("late_fee_amount") or 0)
    if late_fee_amount > 0:
        rows.append({
            "position": pos,
            "posting_key": "40 · Debit",
            "account": "6500 · Late Payment Charges",
            "description": "Late payment charge (Denda)",
            "tax_code": "—",
            "debit": round(late_fee_amount, 2),
            "credit": 0,
            "is_visible": True,
        })
        pos += 1

    stamp_duty_amount = float(bp.get("stamp_duty_amount") or 0)
    if stamp_duty_amount > 0:
        rows.append({
            "position": pos,
            "posting_key": "40 · Debit",
            # Posted to the invoice's own rent/expense account as an
            # unallocated difference, per explicit instruction, rather than to a
            # dedicated stamp-duty account.
            "account": f"{(line_items[0].get('gl_account_code') if line_items else None) or '6100-RENT'} · rent",
            "description": "Unallocated difference",
            "tax_code": "—",
            "debit": round(stamp_duty_amount, 2),
            "credit": 0,
            "is_visible": True,
        })
        pos += 1

    # Input tax debit — shown for ANY invoice with a VAT code set, including a
    # 0% rate (mirrors P2P exactly: gated on the code being present, not on
    # tax_amount > 0). Never emitted for a vendor with vat_applicable=False
    # (RATNA_INTAN) — its line items never carry a vat_tax_code in the first
    # place (see _bill_posting_out), but the explicit gate here is the
    # authoritative one.
    input_vat_code = next((it.get("vat_tax_code") for it in line_items if it.get("vat_tax_code")), "—")
    if bp.get("vat_applicable", True) and any(it.get("vat_tax_code") for it in line_items):
        # tax_rate is a whole percentage number (11, not 0.11) — see
        # payment_schedule.json/invoice_extraction.json's own convention.
        vat_pct = f"{tax_rate:.0f}%" if tax_rate else ""
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

    # Same applicability rules post_bill enforces, surfaced here so Simulate
    # catches a wrong code before the user tries to post.
    if status == "success":
        tax_error = _validate_bill_posting_tax_codes(bp)
        if tax_error:
            status = "error"
            message = f"Simulation failed — {tax_error}"

    return {"status": status, "message": message, "document": document}


# ── Tracker ────────────────────────────────────────────────────────────────────
# A read-only, centralized view of every invoice that has FINISHED processing —
# the same two terminal outcomes the dashboard's own Closed tab uses
# (dashboard.tsx's INVOICE_CLOSED_STATUSES). Nothing here computes anything of
# its own: every money figure is taken from _bill_posting_out, so a tracker row
# and that invoice's own Bill Posting page can never disagree about Taxable /
# VAT / WHT / Payable. That matters because those four are NOT simply
# extraction fields — WHT and Payable both fold in the matched installment, the
# RATNA_INTAN schedule substitution and the reviewer's own WHT-code selection
# (see _bill_posting_out's own notes), so reading them off `extracted` here
# would quietly print different numbers than the posting screen did.

# EVERY invoice, at every stage — a live view of the pipeline, not a ledger of
# finished work. A row exists from the moment of upload and fills in as the
# invoice moves; it was previously filtered to ("posted", "rejected"), which made
# an invoice invisible for its entire working life.
#
# Two consequences of that widening, both handled below:
#   - most rows now have NO extracted data yet, so the money guard that used to
#     matter only for the rare pre-extraction rejection is now the common path;
#   - a run can sit at any status, including `rejected` from a stage that never
#     extracted anything (review_action's reject has no stage gate).


def _tracker_iso_date(value) -> Optional[str]:
    """A sortable/filterable ISO form of one of these fixtures' printed dates.

    The Tracker's date-range filters and date sorting can't work off the printed
    strings: the same column legitimately holds "2026-07-01", "25 June 2026" and
    "30 Juli 2026" (Indonesian), which neither sort nor compare correctly as
    text. So each date column is sent twice — the verbatim string for display,
    this normalized form for the filtering.

    _parse_loose_date is the authority (it is what Matching itself compares
    dates with), extended here only by an abbreviated-month fallback for the one
    shape it doesn't cover ("9 Jul 2026" — _MONTH_NAMES holds full names only).
    That fallback lives here rather than in _MONTH_NAMES deliberately: widening
    the shared map would make dates parseable that Matching currently treats as
    unparseable, which can change an installment tie-break (see
    _due_date_tiebreak). Display and matching stay exactly as they are; only the
    tracker's own filtering gets the extra tolerance.
    """
    parsed = _parse_loose_date(value)
    if parsed:
        return parsed.date().isoformat()
    if not isinstance(value, str):
        return None
    parts = value.strip().replace("-", " ").replace("/", " ").split()
    if len(parts) != 3:
        return None
    day, month, year = parts
    prefix = month.lower()[:3]
    num = next((n for name, n in _MONTH_NAMES.items() if name.startswith(prefix)), None)
    if not num or not day.isdigit() or not year.isdigit():
        return None
    try:
        return datetime(int(year), num, int(day)).date().isoformat()
    except ValueError:
        return None


async def list_tracker(db) -> list[dict]:
    cursor = dp_invoice_runs(db).find({}).sort("created_at", -1)
    docs = await cursor.to_list(length=500)

    # Resolve the fixture set ONCE for the whole listing. _bill_posting_out
    # otherwise calls get_dp_loader().discover() per row, and discover()
    # re-reads every fixture JSON off disk on each call (deliberately — it's what
    # makes live fixture edits work). At two statuses that was ~11 directory
    # walks per request; across the whole pipeline, polled every few seconds,
    # it's the difference between one scan and hundreds.
    bundles = get_dp_loader().discover()

    rows = []
    for doc in docs:
        contract_doc = await _fetch_matched_contract_doc(db, doc)
        bp = _bill_posting_out(doc, contract_doc, bundles)
        extracted = _strip_na(_merge(doc.get("base_extracted") or {}, doc.get("edited_extracted")))
        review = doc.get("review") or {}
        erp = doc.get("erp") or {}
        contract_fields = (
            _strip_na(_merge(contract_doc.get("base_fields") or {}, contract_doc.get("edited_fields")))
            if contract_doc else {}
        )
        posted_at = erp.get("posted_at")
        # An invoice rejected BEFORE extraction ran has no extracted data at all
        # (base_extracted is None until extract_invoice writes it). _bill_posting_out
        # still answers with figures in that case, because its payable/WHT fallbacks
        # reach into the matched contract's payment schedule — which for such a run
        # would print a schedule row's amount as though it were this invoice's own.
        # Bill Posting never hits that path (it refuses any run before the
        # bill_posting stage); the Tracker has to include the run, so it blanks the
        # money columns instead. A tracker row must never show a figure the invoice
        # itself never stated.
        has_extraction = bool(doc.get("base_extracted"))
        money = (lambda v: v if has_extraction else None)
        rows.append({
            "id": str(doc["_id"]),
            "file_name": doc.get("file_name"),
            "status": doc.get("status"),
            # Routing back to this invoice's own processing record is the
            # frontend's job (utils/directpayRoutes.ts), and its rule needs just
            # this one beyond `status` — see invoiceRoute's own note on why
            # "extracted" alone can't tell a pre- from a post-confirm run. It
            # ALSO disambiguates the Status column: the pipeline parks three
            # different moments on "extracted" (freshly extracted, confirmed,
            # and post-Faktur-Pajak), so the label depends on this flag.
            #
            # A `has_faktur_pajak` key used to sit here reading
            # doc.get("has_faktur_pajak") — but nothing ever writes that key onto
            # an invoice doc (invoice_out COMPUTES it from the fixture bundle
            # instead), so it was always False. Dropped rather than fixed: it had
            # no consumer, and the comment claiming invoiceRoute needed it was
            # wrong — invoiceRoute reads only id/status/extraction_confirmed.
            "extraction_confirmed": bool(doc.get("extraction_confirmed")),
            # Auto-Process progress, so an in-flight row reads as moving rather
            # than stuck, and a held one can say what it's waiting on.
            "stp_state": doc.get("stp_state"),
            "stp_failure_reason": doc.get("stp_failure_reason"),
            # Provenance — the only other thing a brand-new row knows about
            # itself besides its file name.
            "source": doc.get("source") or "manual",
            # Whether extraction has produced ANY data for this run. Drives the
            # UI's "not known yet" (—) treatment, which has to stay distinct from
            # "NA" ("the document genuinely doesn't state this"). The frontend
            # can't infer this from nulls: a completed invoice legitimately has
            # null columns too (DEBORA states no due date).
            "has_extraction": has_extraction,

            # Already a real ISO timestamp (it's the run's own created_at), so
            # unlike the two printed dates below it needs no normalized twin.
            "invoice_received_date": bp.get("invoice_received_date"),
            "vendor_name": bp.get("vendor_name"),
            "invoice_number": bp.get("invoice_number"),
            "invoice_date": bp.get("invoice_date"),
            "invoice_date_iso": _tracker_iso_date(bp.get("invoice_date")),
            # Invoice-LEVEL description (one of the source schema's metadata
            # fields), not a line item's own item_description. Falls back to the
            # first line item's label so a tracker row is never blank for a
            # vendor whose invoice states no metadata description.
            "description": extracted.get("description") or _first_line_item_label(extracted),
            "currency": money(bp.get("currency")),
            "taxable_amount": money(bp.get("subtotal")),
            "vat_amount": money(bp.get("tax_amount")),
            # Null rather than 0 when withholding doesn't apply at all, so the
            # column can honestly read "NA" ("if applicable") instead of
            # implying a real zero-rupiah withholding.
            "wht_amount": money(bp.get("wht_amount")) if bp.get("wht_applicable") else None,
            "wht_applicable": has_extraction and bool(bp.get("wht_applicable")),
            "payable_amount": money(bp.get("payable_amount")),
            "payment_due_date": bp.get("payment_due_date"),
            "payment_due_date_iso": _tracker_iso_date(bp.get("payment_due_date")),
            "bank_account_name": bp.get("bank_account_name"),
            "bank_account_number": bp.get("bank_account_number"),

            "contract_id": bp.get("contract_id"),
            # What the Contract filter groups on — the contract's OWN vendor
            # name, which is the same label the dashboard's "Matched Contract"
            # column shows. Falls back to the file name for a contract whose
            # extraction has no vendor name.
            "contract_name": contract_fields.get("vendor_name") or (contract_doc or {}).get("file_name"),
            "erp_bill_number": erp.get("bill_number"),
            "posted_at": posted_at.isoformat() if hasattr(posted_at, "isoformat") else posted_at,
            "rejection_reason": review.get("reason") if doc.get("status") == "rejected" else None,
            "updated_at": doc.get("updated_at"),
        })
    return rows


def _first_line_item_label(extracted: dict) -> Optional[str]:
    for item in (extracted.get("line_items") or []):
        if item.get("label"):
            return item["label"]
    return None


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


async def _dp_ack_memory_count(db, memory_field_name: str, source_value, found_value) -> int:
    """How many times this exact (memory_field_name, source_value) pair has
    been manually acknowledged with this exact found_value — the raw count
    _apply_dp_ack_memory and the Faktur Pajak equivalent below both compare
    against the DP Acknowledge Threshold."""
    source_norm = _normalize_for_memory(source_value)
    if not source_norm:
        return 0
    found_norm = _normalize_for_memory(found_value)
    coll = dp_field_acknowledgement_memory(db)
    memory_doc = await coll.find_one({"field_name": memory_field_name, "source_value": source_norm})
    if not memory_doc:
        return 0
    return next(
        (e.get("c", 0) for e in (memory_doc.get("acknowledgement_counts") or []) if e.get("v") == found_norm),
        0,
    )


async def _apply_dp_ack_memory(db, findings: list[dict], extracted: dict) -> list[str]:
    """Return finding_ids that are pre-blessed by learned memory (field,
    contract-value, current-invoice-value) — uses the LIVE extracted value so
    this stays correct across edits/reloads, same reasoning as the "resolved
    via copy" check on the frontend."""
    if not findings:
        return []
    from .stp import get_dp_ack_threshold  # local import — stp.py never imports service.py's endpoints back
    threshold = await get_dp_ack_threshold(db)
    system_ids: list[str] = []
    for f in findings:
        if f.get("severity") == "error":
            continue
        field = f.get("field")
        if not field or f.get("expected_value") is None:
            continue
        count = await _dp_ack_memory_count(db, field, f.get("expected_value"), extracted.get(field))
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

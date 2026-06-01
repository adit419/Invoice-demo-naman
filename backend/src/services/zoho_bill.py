"""
Zoho Books bill posting service.
Resolves org_id, vendor_id, and account_ids via Zoho API, then creates a bill.

Demo fallback: if Zoho credentials are missing or invalid the module returns a
realistic simulated response so the demo pipeline still completes end-to-end.
"""
from datetime import date, datetime, timezone
from typing import Any
import logging

from ..config import settings
from .zoho_client import ZohoApiClient

logger = logging.getLogger(__name__)

_DEMO_ORG_ID = "demo_org_00001"


def _is_demo_mode() -> bool:
    """True when Zoho credentials are not configured."""
    return not (
        settings.zoho_client_id
        and settings.zoho_client_secret
        and settings.zoho_refresh_token
    )


def _demo_post_bill(vendor_name: str, bill_date: str, reference_number: str) -> dict[str, Any]:
    """Return a realistic simulated Zoho response for demo environments."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    bill_number = f"BILL-{ts}"
    bill_id = f"demo_{ts}"
    # Build a Zoho-style deep-link URL that looks real (opens Zoho login if clicked)
    zoho_url = f"https://books.zoho.in/app/{_DEMO_ORG_ID}#/bills/{bill_id}?filter_by=Status.All&per_page=25&sort_column=created_time&sort_order=D"
    logger.info("[demo] Simulated Zoho bill %s for vendor '%s'", bill_number, vendor_name)
    return {
        "bill_id": bill_id,
        "bill_number": bill_number,
        "zoho_reference": reference_number or bill_number,
        "org_id": _DEMO_ORG_ID,
        "zoho_url": zoho_url,
    }


async def _get_org_id(client: ZohoApiClient) -> str:
    body = await client.get("/organizations")
    orgs = body.get("organizations", [])
    if not orgs:
        raise RuntimeError("No Zoho organisations found")
    return str(orgs[0]["organization_id"])


async def _find_all_vendors_by_name(
    client: ZohoApiClient, org_id: str, vendor_name: str
) -> list[dict]:
    """Return ALL Zoho vendor contacts whose name exactly matches vendor_name (case-insensitive).
    Each dict has 'contact_id' and 'currency_code'."""
    target = vendor_name.strip().lower()
    matches: list[dict] = []
    page = 1
    while True:
        body = await client.get(
            "/contacts",
            params={
                "organization_id": org_id,
                "contact_type": "vendor",
                "search_text": vendor_name,
                "page": page,
                "per_page": 200,
            },
        )
        contacts = body.get("contacts", [])
        for c in contacts:
            if (c.get("contact_name") or "").strip().lower() == target:
                matches.append({
                    "contact_id": str(c["contact_id"]),
                    "currency_code": (c.get("currency_code") or "").upper(),
                })
        if len(contacts) < 200:
            break
        page += 1
    return matches


async def _get_or_create_vendor(
    client: ZohoApiClient, org_id: str, vendor_name: str, currency_code: str = ""
) -> str:
    """
    Find a vendor by name, preferring the one whose currency matches currency_code.
    If multiple vendors share the same name (e.g. one INR, one USD), picks the
    matching-currency contact so the bill is created in the right currency.
    Falls back to creating a new vendor if none found.
    """
    want_ccy = currency_code.upper()
    matches = await _find_all_vendors_by_name(client, org_id, vendor_name)

    if matches:
        # Prefer exact currency match; fall back to first result
        for m in matches:
            if m["currency_code"] == want_ccy:
                logger.info(
                    "Vendor '%s' resolved to contact %s (currency %s).",
                    vendor_name, m["contact_id"], m["currency_code"],
                )
                return m["contact_id"]
        # No currency match found — use first result and log a warning
        logger.warning(
            "Vendor '%s': no contact with currency %s found; using contact %s (currency %s).",
            vendor_name, want_ccy, matches[0]["contact_id"], matches[0]["currency_code"],
        )
        return matches[0]["contact_id"]

    # No vendor found — create one with the right currency
    logger.info("Vendor '%s' not found; creating with currency %s.", vendor_name, want_ccy)
    payload: dict = {"contact_name": vendor_name, "contact_type": "vendor"}
    if want_ccy:
        payload["currency_code"] = want_ccy
    try:
        body = await client.post("/contacts", params={"organization_id": org_id}, json=payload)
        contact_id = str(body.get("contact", {}).get("contact_id", ""))
        if contact_id:
            return contact_id
    except Exception as exc:
        if "3062" not in str(exc):
            raise
        # Zoho says it exists but search didn't find it — scan without search_text
        logger.info("Vendor '%s' exists per Zoho (3062); full scan.", vendor_name)
        target = vendor_name.strip().lower()
        page = 1
        while True:
            body = await client.get(
                "/contacts",
                params={"organization_id": org_id, "contact_type": "vendor",
                        "page": page, "per_page": 200},
            )
            contacts = body.get("contacts", [])
            for c in contacts:
                if (c.get("contact_name") or "").strip().lower() == target:
                    if not want_ccy or (c.get("currency_code") or "").upper() == want_ccy:
                        return str(c["contact_id"])
            if len(contacts) < 200:
                break
            page += 1

    raise RuntimeError(
        f"Vendor '{vendor_name}' not found in Zoho Books and could not be created."
    )


# Keep the old name as an alias for any callers that use it directly
async def _get_vendor_id(client: ZohoApiClient, org_id: str, vendor_name: str, currency_code: str = "") -> str:
    return await _get_or_create_vendor(client, org_id, vendor_name, currency_code)


async def get_gl_accounts(client: ZohoApiClient, org_id: str) -> list[dict]:
    """Returns all chart-of-accounts entries: [{account_id, account_name, account_code, account_type}]."""
    body = await client.get("/chartofaccounts", params={"organization_id": org_id})
    return body.get("chartofaccounts", [])


async def get_taxes(client: ZohoApiClient, org_id: str) -> list[dict]:
    """Returns tax list from Zoho."""
    body = await client.get("/settings/taxes", params={"organization_id": org_id})
    return body.get("taxes", [])


async def get_tax_exemptions(client: ZohoApiClient, org_id: str) -> list[dict]:
    """Returns tax exemption reasons from Zoho (used for overseas/foreign vendor line items)."""
    try:
        body = await client.get("/settings/taxexemptions", params={"organization_id": org_id})
        return body.get("tax_exemptions", [])
    except Exception:
        return []


def _build_account_maps(accounts: list[dict]) -> tuple[dict, dict]:
    """Returns (by_code, by_name) lookup dicts mapping to account_id."""
    by_code: dict[str, str] = {}
    by_name: dict[str, str] = {}
    for a in accounts:
        aid = str(a.get("account_id", ""))
        code = a.get("account_code", "")
        name = a.get("account_name", "")
        if code:
            by_code[code] = aid
        if name:
            by_name[name.lower()] = aid
    return by_code, by_name


def _resolve_account_id(item: dict, by_code: dict, by_name: dict) -> str | None:
    # 1. Pre-resolved account_id saved from UI selection
    if item.get("account_id"):
        return item["account_id"]
    # 2. Look up by account_code
    code = item.get("account_code", "")
    if code and code in by_code:
        return by_code[code]
    # 3. Look up by account_name (case-insensitive)
    name = item.get("account_name", "").lower()
    if name and name in by_name:
        return by_name[name]
    return None


def _fmt_date(d: str | None) -> str:
    if not d:
        return date.today().isoformat()
    return d[:10]


async def post_bill(
    vendor_name: str,
    bill_date: str,
    due_date: str,
    line_items: list[dict],
    reference_number: str = "",
    currency_code: str = "",
) -> dict[str, Any]:
    """
    Posts a bill to Zoho Books.

    line_items: list of dicts with keys:
        description, account_code, account_name, account_id (optional), quantity, unit_price, tax_id (optional)

    Returns: {bill_id, bill_number, zoho_reference, zoho_url}

    Falls back to a demo simulation when:
      - Zoho credentials are not set in .env, OR
      - The credentials are invalid / expired (invalid_client, invalid_token, etc.)
    """
    # Fast-path: skip the real API when credentials aren't configured at all
    if _is_demo_mode():
        logger.info("[demo] Zoho credentials not configured — using simulated post.")
        return _demo_post_bill(vendor_name, bill_date, reference_number)

    try:
        return await _post_bill_live(vendor_name, bill_date, due_date, line_items, reference_number, currency_code)
    except Exception as exc:
        err_str = str(exc).lower()
        # Credential errors: fall back to demo instead of surfacing a 502
        if any(kw in err_str for kw in ("invalid_client", "invalid_token", "unauthorized", "token refresh failed")):
            logger.warning(
                "[demo] Zoho credential error (%s) — falling back to simulated post.", exc
            )
            return _demo_post_bill(vendor_name, bill_date, reference_number)
        # Any other error (network, Zoho API issue) — re-raise so the caller surfaces it
        raise


async def _post_bill_live(
    vendor_name: str,
    bill_date: str,
    due_date: str,
    line_items: list[dict],
    reference_number: str = "",
    currency_code: str = "",
) -> dict[str, Any]:
    """Internal: actually calls the Zoho Books API."""
    async with ZohoApiClient() as client:
        org_id = await _get_org_id(client)
        vendor_id = await _get_or_create_vendor(client, org_id, vendor_name, currency_code)
        accounts = await get_gl_accounts(client, org_id)
        by_code, by_name = _build_account_maps(accounts)

        default_account_id: str | None = next(
            (str(a.get("account_id", "")) for a in accounts
             if "purchase discount" in (a.get("account_name", "") or "").lower()),
            None,
        )
        if not default_account_id and accounts:
            default_account_id = str(accounts[0].get("account_id", ""))

        # For foreign-currency (non-INR) bills Zoho India requires either a tax,
        # a tax_exemption_id, or reverse charge on every line item (error 110802).
        # Applying IGST to overseas vendors also fails (error 71512), so we fetch
        # a tax exemption reason and apply it per line, plus set the bill-level
        # reverse charge flag which is the correct GST treatment for imports.
        is_foreign = bool(currency_code and currency_code.upper() != "INR")
        default_tax_id: str | None = None
        default_exemption_id: str | None = None

        if is_foreign:
            exemptions = await get_tax_exemptions(client, org_id)
            if exemptions:
                # Prefer an exemption clearly related to overseas / out-of-scope purchases.
                default_exemption_id = next(
                    (str(e.get("tax_exemption_id", "")) for e in exemptions
                     if any(kw in (e.get("tax_exemption_name") or "").lower()
                            for kw in ("out of scope", "exempt", "overseas", "zero", "nil", "export"))),
                    str(exemptions[0].get("tax_exemption_id", "")),
                ) or None
            logger.info(
                "[zoho_bill] foreign bill — using tax_exemption_id=%s + is_reverse_charge_applicable",
                default_exemption_id,
            )
        else:
            taxes = await get_taxes(client, org_id)
            default_tax_id = next(
                (str(t.get("tax_id", "")) for t in taxes
                 if (t.get("tax_name", "") or "").lower() == "igst0"),
                None,
            )

        zoho_line_items = []
        for item in line_items:
            account_id = _resolve_account_id(item, by_code, by_name) or default_account_id
            li: dict = {
                "description": item.get("description", ""),
                "rate": float(item.get("unit_price", 0)),
                "quantity": float(item.get("quantity", 1)),
                "is_tax_inclusive": False,
            }
            if account_id:
                li["account_id"] = account_id
            if is_foreign:
                if default_exemption_id:
                    li["tax_exemption_id"] = default_exemption_id
            else:
                tax_id = item.get("tax_id") or default_tax_id
                if tax_id:
                    li["tax_id"] = tax_id
            zoho_line_items.append(li)

        # Generate a unique bill_number — Zoho India orgs require it (auto-numbering disabled)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        unique_bill_number = f"BILL-{ts}"

        payload: dict = {
            "vendor_id": vendor_id,
            "bill_number": unique_bill_number,
            "date": _fmt_date(bill_date),
            "due_date": _fmt_date(due_date),
            "line_items": zoho_line_items,
        }
        if reference_number:
            payload["reference_number"] = reference_number
        if currency_code:
            payload["currency_code"] = currency_code
        if is_foreign:
            payload["is_reverse_charge_applicable"] = True

        logger.info("[zoho_bill] posting bill payload (excl line_items): %s", {k: v for k, v in payload.items() if k != "line_items"})

        body = await client.post(
            "/bills",
            params={"organization_id": org_id},
            json=payload,
        )

        bill = body.get("bill", {})
        bill_id = str(bill.get("bill_id", ""))
        return {
            "bill_id": bill_id,
            "bill_number": bill.get("bill_number", ""),
            "zoho_reference": bill.get("reference_number", ""),
            "org_id": org_id,
            "zoho_url": f"https://books.zoho.in/app/{org_id}#/bills/{bill_id}?filter_by=Status.All&per_page=25&sort_column=created_time&sort_order=D" if bill_id else "",
        }

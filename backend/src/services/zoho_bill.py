"""
Zoho Books bill posting service.
Resolves org_id, vendor_id, and account_ids via Zoho API, then creates a bill.
"""
from datetime import date, datetime, timezone
from typing import Any

from .zoho_client import ZohoApiClient


async def _get_org_id(client: ZohoApiClient) -> str:
    body = await client.get("/organizations")
    orgs = body.get("organizations", [])
    if not orgs:
        raise RuntimeError("No Zoho organisations found")
    return str(orgs[0]["organization_id"])


async def _get_vendor_id(client: ZohoApiClient, org_id: str, vendor_name: str) -> str:
    body = await client.get(
        "/contacts",
        params={
            "organization_id": org_id,
            "contact_type": "vendor",
            "search_text": vendor_name,
        },
    )
    contacts = body.get("contacts", [])
    if not contacts:
        raise RuntimeError(f"Vendor '{vendor_name}' not found in Zoho Books")
    return str(contacts[0]["contact_id"])


async def get_gl_accounts(client: ZohoApiClient, org_id: str) -> list[dict]:
    """Returns all chart-of-accounts entries: [{account_id, account_name, account_code, account_type}]."""
    body = await client.get("/chartofaccounts", params={"organization_id": org_id})
    return body.get("chartofaccounts", [])


async def get_taxes(client: ZohoApiClient, org_id: str) -> list[dict]:
    """Returns tax list from Zoho."""
    body = await client.get("/settings/taxes", params={"organization_id": org_id})
    return body.get("taxes", [])


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
) -> dict[str, Any]:
    """
    Posts a bill to Zoho Books.

    line_items: list of dicts with keys:
        description, account_code, account_name, account_id (optional), quantity, unit_price, tax_id (optional)

    Returns: {bill_id, bill_number, zoho_reference}
    """
    async with ZohoApiClient() as client:
        org_id = await _get_org_id(client)
        vendor_id = await _get_vendor_id(client, org_id, vendor_name)
        accounts = await get_gl_accounts(client, org_id)
        by_code, by_name = _build_account_maps(accounts)

        # ── Demo defaults ───────────────────────────────────────────────────
        # The new SAP-style UI no longer asks users to pick an account / tax
        # per line, but Zoho requires both. We pin the demo to:
        #   - Account: "Purchase Discount"
        #   - Tax:     "IGST0"
        # The values match what the legacy Zoho-aware UI sent (see the prior
        # bill-posting.tsx loadData defaults).
        default_account_id: str | None = next(
            (str(a.get("account_id", "")) for a in accounts
             if "purchase discount" in (a.get("account_name", "") or "").lower()),
            None,
        )
        # Fallback: first account on the chart, so the demo never sends a
        # blank account_id (Zoho rejects with code 13009).
        if not default_account_id and accounts:
            default_account_id = str(accounts[0].get("account_id", ""))

        taxes = await get_taxes(client, org_id)
        default_tax_id: str | None = next(
            (str(t.get("tax_id", "")) for t in taxes
             if (t.get("tax_name", "") or "").lower() == "igst0"),
            None,
        )

        zoho_line_items = []
        for item in line_items:
            account_id = _resolve_account_id(item, by_code, by_name) or default_account_id
            tax_id = item.get("tax_id") or default_tax_id
            li: dict = {
                "description": item.get("description", ""),
                "rate": float(item.get("unit_price", 0)),
                "quantity": float(item.get("quantity", 1)),
                "is_tax_inclusive": False,
            }
            if account_id:
                li["account_id"] = account_id
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
            "zoho_url": f"https://books.zoho.in/app/{org_id}#/bills/{bill_id}" if bill_id else "",
        }

"""
Zoho Books reference data endpoints — GL accounts and taxes.
Used by the bill-posting UI to populate dropdowns.
"""
from fastapi import APIRouter

from ...auth.deps import CurrentUser
from ...services.zoho_bill import get_gl_accounts, get_taxes, _get_org_id
from ...services.zoho_client import ZohoApiClient

router = APIRouter(prefix="/zoho", tags=["zoho"])


from ._common import _envelope


@router.get("/accounts")
async def list_gl_accounts(current_user: CurrentUser):
    """Returns chart-of-accounts entries for use in the Account dropdown."""
    async with ZohoApiClient() as client:
        org_id = await _get_org_id(client)
        accounts = await get_gl_accounts(client, org_id)

    return _envelope(data=[
        {
            "account_id": str(a.get("account_id", "")),
            "account_name": a.get("account_name", ""),
            "account_code": a.get("account_code", ""),
            "account_type": a.get("account_type", ""),
        }
        for a in accounts
        if a.get("account_id")
    ])


@router.get("/taxes")
async def list_taxes(current_user: CurrentUser):
    """Returns available tax rates for use in the Tax dropdown."""
    async with ZohoApiClient() as client:
        org_id = await _get_org_id(client)
        taxes = await get_taxes(client, org_id)

    return _envelope(data=[
        {
            "tax_id": str(t.get("tax_id", "")),
            "tax_name": t.get("tax_name", ""),
            "tax_percentage": t.get("tax_percentage", 0),
        }
        for t in taxes
        if t.get("tax_id")
    ])

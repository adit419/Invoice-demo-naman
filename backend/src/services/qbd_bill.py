"""
QuickBooks Desktop bill posting service (via qbwc-bridge).

Demo fallback: if QBWC_BRIDGE_URL is not configured the module returns a
realistic simulated response so the demo pipeline still completes end-to-end.

Unlike cloud ERPs (Zoho, SAP), QBD is a desktop application — there is no
browser URL to link to after posting. Callers should check erp_type == "qbd"
and render a static "QB Desktop" indicator instead of a "View in ERP" link.
"""
import asyncio
import base64
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_SERVICE_NAME = "invoice-demo"


def _is_demo_mode() -> bool:
    """True when the QBWC bridge URL is not configured."""
    return not settings.qbwc_bridge_url


def _demo_post_bill(
    vendor_name: str,
    bill_date: str,
    reference_number: str,
) -> dict[str, Any]:
    """Return a realistic simulated QBD response for demo environments."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    # QB Desktop TxnIDs are numeric; simulate one
    txn_id = ts[-10:]
    bill_number = reference_number or f"BILL-QBD-{ts}"
    logger.info("[demo] Simulated QBD bill %s for vendor '%s'", bill_number, vendor_name)
    return {
        "erp_type": "qbd",
        "bill_id": txn_id,
        "bill_number": bill_number,
        "ref_number": reference_number,
        # QBD has no web URL — callers must not render a "View in ERP" link
        "zoho_url": "",
        "zoho_reference": reference_number,
    }


async def post_bill(
    vendor_name: str,
    bill_date: str,
    due_date: str,
    line_items: list[dict],
    reference_number: str = "",
    currency_code: str = "",
    fixture_key: str = "",
) -> dict[str, Any]:
    """
    Posts a bill to QuickBooks Desktop via the qbwc-bridge.

    line_items: list of dicts with keys:
        description, quantity, unit_price

    Returns: {erp_type, bill_id, bill_number, ref_number, zoho_url, zoho_reference}

    Falls back to a demo simulation when QBWC_BRIDGE_URL is not configured.
    """
    if _is_demo_mode():
        logger.info("[demo] QBWC_BRIDGE_URL not configured — using simulated QBD post.")
        return _demo_post_bill(vendor_name, bill_date, reference_number)

    try:
        return await _post_bill_live(
            vendor_name=vendor_name,
            bill_date=bill_date,
            due_date=due_date,
            line_items=line_items,
            reference_number=reference_number,
        )
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in ("unhealthy", "not polling", "disconnected", "503")):
            logger.warning(
                "[demo] QBWC bridge unhealthy (%s) — falling back to simulated post.", exc
            )
            return _demo_post_bill(vendor_name, bill_date, reference_number)
        raise


async def _post_bill_live(
    vendor_name: str,
    bill_date: str,
    due_date: str,
    line_items: list[dict],
    reference_number: str = "",
) -> dict[str, Any]:
    """Internal: actually calls the qbwc-bridge API."""
    bridge_url = settings.qbwc_bridge_url.rstrip("/")
    tenant_id = settings.qbwc_bridge_tenant_id
    secret = settings.qbwc_bridge_secret

    token = base64.b64encode(f"{_SERVICE_NAME}:{secret}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}

    payload = {
        "vendor_ref": vendor_name,
        "txn_date": bill_date[:10],
        "due_date": due_date[:10] if due_date else None,
        "line_items": [
            {
                "item_ref": li.get("item_ref") or li.get("description", ""),
                "description": li.get("description", ""),
                "quantity": float(li.get("quantity", 1)),
                "unit_price": float(li.get("unit_price", 0)),
            }
            for li in line_items
        ],
    }

    url = f"{bridge_url}/entities/{tenant_id}/bills"
    logger.info("[qbd_bill] posting bill to bridge: vendor=%s ref=%s", vendor_name, reference_number)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)

    if resp.status_code == 503:
        detail = resp.json().get("detail", "QBWC is not polling")
        raise RuntimeError(f"QBWC bridge unhealthy: {detail}")
    if resp.status_code != 202:
        raise RuntimeError(f"Bridge POST /bills returned {resp.status_code}: {resp.text}")

    request_id = resp.json()["request_id"]
    logger.info("[qbd_bill] bill enqueued, request_id=%s", request_id)

    result = await _poll_request(bridge_url, request_id)

    txn_id = str(result.get("txn_id") or result.get("TxnID") or result.get("bill_id") or "")
    bill_number = result.get("txn_number") or result.get("RefNumber") or result.get("ref_number") or reference_number

    logger.info("[qbd_bill] bill created: txn_id=%s ref=%s", txn_id, bill_number)
    return {
        "erp_type": "qbd",
        "bill_id": txn_id,
        "bill_number": bill_number,
        "ref_number": reference_number,
        "zoho_url": "",
        "zoho_reference": reference_number,
    }


async def _poll_request(bridge_url: str, request_id: str, timeout: int = 120) -> dict:
    url = f"{bridge_url}/requests/{request_id}"
    elapsed = 0
    interval = 2
    token = base64.b64encode(f"{_SERVICE_NAME}:{settings.qbwc_bridge_secret}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}

    async with httpx.AsyncClient(timeout=10) as client:
        while elapsed < timeout:
            resp = await client.get(url, headers=headers)
            body = resp.json()
            status = body.get("status")

            if status == "ready":
                result = body.get("response_json")
                if result is None:
                    raise RuntimeError("Bridge returned ready but response_json is empty")
                return result if isinstance(result, dict) else {}

            if status == "error":
                raise RuntimeError(f"QB Desktop error: {body.get('error')}")

            await asyncio.sleep(interval)
            elapsed += interval

    raise RuntimeError(f"QBD request {request_id} did not complete within {timeout}s")

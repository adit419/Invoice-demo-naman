"""Background task: polls the dedicated pricing mailbox (finance-pricing@neoflo.ai)
for unread emails, extracts the pricing change with Claude, and drops it into the
maker-checker approval queue.

Uses its own OAuth refresh token (per-mailbox) but reuses the shared OAuth app
credentials (gmail_client_id / gmail_client_secret). Kept self-contained rather
than reusing services/gmail_client.py because that client is hard-wired to the
invoice mailbox's global settings.
"""
import asyncio
import base64
import logging
import os
import sys

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


def _import_pricing():
    """Import the vendored `pricing` module (lives in src/claim, added to sys.path
    by claim.router at import time — ensure it's importable here too)."""
    claim_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "claim")
    if claim_dir not in sys.path:
        sys.path.insert(0, claim_dir)
    import pricing  # noqa: E402
    return pricing


async def _get_access_token() -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(_TOKEN_URL, data={
            "client_id": settings.gmail_client_id,
            "client_secret": settings.gmail_client_secret,
            "refresh_token": settings.pricing_gmail_refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _list_unread(token: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GMAIL_BASE}/messages",
            params={"q": "is:unread -category:promotions -category:social", "maxResults": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json().get("messages", [])


async def _get_message(token: str, message_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GMAIL_BASE}/messages/{message_id}",
            params={"format": "full"},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def _mark_read(token: str, message_id: str) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{_GMAIL_BASE}/messages/{message_id}/modify",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"removeLabelIds": ["UNREAD"]},
        )


def _header(msg: dict, name: str) -> str:
    for h in msg.get("payload", {}).get("headers", []):
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _decode(data: str) -> str:
    try:
        return base64.urlsafe_b64decode(data + "===").decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def _plain_body(payload: dict) -> str:
    """Walk the MIME tree and return the best-effort plain-text body."""
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data")
    if mime == "text/plain" and body_data:
        return _decode(body_data)
    parts = payload.get("parts", [])
    # prefer text/plain, fall back to any text
    for want in ("text/plain", "text/html"):
        for p in parts:
            if p.get("mimeType") == want:
                got = _plain_body(p)
                if got:
                    return got
    for p in parts:
        got = _plain_body(p)
        if got:
            return got
    return ""


async def _process(token: str, message: dict) -> None:
    msg_id = message.get("id", "")
    try:
        full = await _get_message(token, msg_id)
        subject = _header(full, "Subject")
        sender = _header(full, "From")
        body = _plain_body(full.get("payload", {})).strip()
        if not body:
            logger.info("Pricing email %s has no readable body — marking read", msg_id)
            await _mark_read(token, msg_id)
            return

        pricing = _import_pricing()
        try:
            rec = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: pricing.extract_and_queue(
                    subject, body, sender=sender, source="email", source_email_id=msg_id,
                ),
            )
            logger.info(
                "Pricing email %s queued as %s (%s %s %s)",
                msg_id, rec["id"], rec["kind"], rec["bank"], rec["payment_mode"],
            )
        except ValueError as e:
            # not a commercial change — that's fine, just skip it
            logger.info("Pricing email %s not a pricing change: %s", msg_id, e)
        await _mark_read(token, msg_id)
    except Exception:
        logger.exception("Failed to process pricing email %s", msg_id)


async def pricing_poll_loop() -> None:
    logger.info(
        "Pricing mailbox poller started — polling every %ds for %s",
        settings.pricing_gmail_poll_interval,
        settings.pricing_gmail_target_email,
    )
    while True:
        try:
            token = await _get_access_token()
            messages = await _list_unread(token)
            if messages:
                logger.info("Found %d unread pricing email(s)", len(messages))
                for msg in messages:
                    await _process(token, msg)
        except Exception:
            logger.exception("Pricing poll cycle error")
        await asyncio.sleep(settings.pricing_gmail_poll_interval)

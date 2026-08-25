"""FreshDesk client — posts DirectPay's notifications as replies on the vendor's
own ticket.

One operation: reply to a ticket. Threading comes for free because every reply
lands on the same ticket, so there is none of the Message-ID/threadId bookkeeping
an email thread needs.

    POST https://<domain>/api/v2/tickets/{ticket_id}/reply
    Authorization: Basic <token>
    {"body_html": "..."}
"""
import asyncio
import base64
import logging
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

# Retries: a ticket can be momentarily locked, and the network can blip. A closed
# ticket or a bad id is permanent, so 4xx other than 429 is not retried.
_MAX_ATTEMPTS = 3
_BACKOFF_S = (1.0, 3.0)


def is_configured() -> bool:
    return bool(settings.freshdesk_enabled and settings.freshdesk_domain and settings.freshdesk_token)


def _auth_header() -> str:
    """FreshDesk wants Basic <base64(api_key:X)>. Accepts either the raw API key
    or an already-encoded value, so whichever form ends up in the env works."""
    token = settings.freshdesk_token.strip()
    if token.lower().startswith("basic "):
        return token
    try:
        # Already base64? Then it decodes and contains the ':' separator.
        if ":" in base64.b64decode(token, validate=True).decode():
            return f"Basic {token}"
    except Exception:
        pass
    return "Basic " + base64.b64encode(f"{token}:X".encode()).decode()


async def reply_to_ticket(ticket_id: str, body_html: str) -> dict:
    """Post a reply. Returns {"ok", "status", ...}; never raises."""
    if not is_configured():
        return {"ok": False, "reason": "freshdesk_not_configured"}

    # An explicit scheme in freshdesk_domain is honoured, so the env can point at
    # a sandbox or a local stub; a bare host defaults to https.
    host = settings.freshdesk_domain.rstrip("/")
    if host.startswith(("http://", "https://")):
        base = host
    else:
        # A bare account name ("neoflo") is how the subdomain is usually written
        # down — on its own it isn't a resolvable host, so complete it. Anything
        # already carrying a dot is taken as the full host it looks like.
        base = f"https://{host}" if "." in host else f"https://{host}.freshdesk.com"
    url = f"{base}/api/v2/tickets/{ticket_id}/reply"
    headers = {"Content-Type": "application/json", "Authorization": _auth_header()}

    last: dict = {"ok": False, "reason": "no_attempt"}
    for attempt in range(_MAX_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=headers, json={"body_html": body_html})
            if resp.status_code < 300:
                return {"ok": True, "status": resp.status_code, "reply_id": resp.json().get("id")}
            last = {"ok": False, "status": resp.status_code, "detail": resp.text[:300]}
            # Permanent: wrong id, closed ticket, bad credentials. Retrying just
            # repeats the same answer.
            if resp.status_code < 500 and resp.status_code != 429:
                logger.warning("FreshDesk reply to ticket %s rejected: %s %s",
                               ticket_id, resp.status_code, resp.text[:200])
                return last
        except Exception as exc:
            last = {"ok": False, "reason": type(exc).__name__, "detail": str(exc)[:200]}
        if attempt < _MAX_ATTEMPTS - 1:
            await asyncio.sleep(_BACKOFF_S[attempt])
    logger.warning("FreshDesk reply to ticket %s failed after %d attempts: %s",
                   ticket_id, _MAX_ATTEMPTS, last)
    return last

"""One Google OAuth access token, shared by every Google client here.

Gmail and Drive run off the SAME OAuth app and the SAME refresh token — one
consent covering gmail.send, gmail.modify and drive — so they must not each
maintain their own cache. Two caches would mean two token exchanges per hour and
two independent things to debug when a grant goes bad.

Extracted from gmail_client, whose `_get_access_token` now delegates here so its
behaviour is unchanged for the three existing P2P/DP call sites.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from ..config import settings

TOKEN_URL = "https://oauth2.googleapis.com/token"

_cached_token: Optional[str] = None
_token_expiry: Optional[datetime] = None


async def get_access_token() -> str:
    """A valid access token, refreshed on demand.

    The refresh token itself is long-lived — it does not expire on its own, so
    this keeps working indefinitely without intervention. The one thing that
    invalidates it is the OAuth app sitting in "Testing" publishing status, where
    Google expires refresh tokens after 7 days; that surfaces here as a 400
    `invalid_grant` from the exchange below.
    """
    global _cached_token, _token_expiry
    now = datetime.now(timezone.utc)
    # 60s of headroom, so a token can't expire mid-request.
    if _cached_token and _token_expiry and (_token_expiry - now).total_seconds() > 60:
        return _cached_token

    async with httpx.AsyncClient() as client:
        resp = await client.post(TOKEN_URL, data={
            "client_id": settings.gmail_client_id,
            "client_secret": settings.gmail_client_secret,
            "refresh_token": settings.gmail_refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        data = resp.json()
        _cached_token = data["access_token"]
        _token_expiry = now + timedelta(seconds=data.get("expires_in", 3600))
        return _cached_token


def reset_cache() -> None:
    """Drop the cached token. For tests, and for a credential change at runtime."""
    global _cached_token, _token_expiry
    _cached_token, _token_expiry = None, None

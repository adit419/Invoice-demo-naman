"""
Async Zoho Books OAuth client for India region.
Token cache is process-global with per-key locking.
"""
import asyncio
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx

from ..config import settings

_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token"
_BOOKS_BASE = "https://www.zohoapis.in/books/v3"

_token_cache: dict[str, dict] = {}
_lock = asyncio.Lock()


async def _refresh_access_token() -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _TOKEN_URL,
            data={
                "refresh_token": settings.zoho_refresh_token,
                "client_id": settings.zoho_client_id,
                "client_secret": settings.zoho_client_secret,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        body = resp.json()
        if "access_token" not in body:
            raise RuntimeError(f"Zoho token refresh failed: {body}")
        return body["access_token"], int(body.get("expires_in", 3600))


async def get_access_token() -> str:
    cache_key = settings.zoho_client_id
    async with _lock:
        entry = _token_cache.get(cache_key)
        if entry and entry["expires_at"] - time.time() > 60:
            return entry["token"]
        token, expires_in = await _refresh_access_token()
        _token_cache[cache_key] = {
            "token": token,
            "expires_at": time.time() + expires_in,
        }
        return token


class ZohoApiClient:
    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(base_url=_BOOKS_BASE, timeout=60)
        return self

    async def __aexit__(self, *_):
        if self._client:
            await self._client.aclose()

    async def request(self, method: str, path: str, **kwargs) -> Any:
        token = await get_access_token()
        headers = {"Authorization": f"Zoho-oauthtoken {token}"}
        resp = await self._client.request(method, path, headers=headers, **kwargs)
        if resp.status_code == 401:
            async with _lock:
                _token_cache.pop(settings.zoho_client_id, None)
            token = await get_access_token()
            headers = {"Authorization": f"Zoho-oauthtoken {token}"}
            resp = await self._client.request(method, path, headers=headers, **kwargs)
        if resp.status_code >= 400:
            try:
                err_body = resp.json()
            except Exception:
                err_body = resp.text
            raise RuntimeError(f"Zoho API {resp.status_code} {path}: {err_body}")
        return resp.json()

    async def get(self, path: str, **kwargs) -> Any:
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs) -> Any:
        return await self.request("POST", path, **kwargs)

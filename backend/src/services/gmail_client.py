"""
Gmail REST client using OAuth2 refresh-token flow.
Uses httpx directly — no google-api-python-client dependency.
"""
import base64
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx

from ..config import settings

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

_cached_token: Optional[str] = None
_token_expiry: Optional[datetime] = None


async def _get_access_token() -> str:
    global _cached_token, _token_expiry
    now = datetime.now(timezone.utc)
    if _cached_token and _token_expiry and (_token_expiry - now).total_seconds() > 60:
        return _cached_token

    async with httpx.AsyncClient() as client:
        resp = await client.post(_TOKEN_URL, data={
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


async def list_unread_invoice_messages() -> list[dict]:
    """Return [{id, threadId}] for unread 'Invoice Processing' emails with PDF attachments."""
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GMAIL_BASE}/messages",
            params={"q": 'subject:"Invoice Processing" is:unread has:attachment', "maxResults": 20},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json().get("messages", [])


async def get_message(message_id: str) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GMAIL_BASE}/messages/{message_id}",
            params={"format": "full"},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def get_attachment_bytes(message_id: str, attachment_id: str) -> bytes:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GMAIL_BASE}/messages/{message_id}/attachments/{attachment_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        raw = resp.json().get("data", "")
        # Gmail uses URL-safe base64 with no padding — add padding before decoding
        return base64.urlsafe_b64decode(raw + "==")


async def mark_as_read(message_id: str) -> None:
    token = await _get_access_token()
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{_GMAIL_BASE}/messages/{message_id}/modify",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"removeLabelIds": ["UNREAD"]},
        )


async def send_html_email(to: str, subject: str, html_body: str) -> None:
    token = await _get_access_token()
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.gmail_target_email
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_GMAIL_BASE}/messages/send",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"raw": raw},
        )
        resp.raise_for_status()


def extract_pdf_attachments(message: dict) -> list[dict]:
    """Return [{filename, attachment_id, mime_type}] for all PDF parts."""
    result = []
    for part in message.get("payload", {}).get("parts", []):
        filename = part.get("filename", "")
        att_id = part.get("body", {}).get("attachmentId")
        if filename and att_id:
            mime = part.get("mimeType", "")
            if "pdf" in mime.lower() or filename.lower().endswith(".pdf"):
                result.append({
                    "filename": filename,
                    "attachment_id": att_id,
                    "mime_type": mime or "application/pdf",
                })
    return result


def extract_sender(message: dict) -> Optional[str]:
    for h in message.get("payload", {}).get("headers", []):
        if h.get("name", "").lower() == "from":
            val = h.get("value", "")
            if "<" in val and ">" in val:
                return val.split("<")[1].rstrip(">").strip()
            return val.strip()
    return None

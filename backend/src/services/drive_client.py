"""Google Drive REST client — uploads DirectPay's standardised documents.

Same shape as gmail_client: raw httpx, no google-api-python-client, and the same
OAuth app / refresh token (see google_auth). Requires the
`https://www.googleapis.com/auth/drive` scope.

Why the full `drive` scope and not `drive.file`: drive.file grants per-file
access only to files the app itself created or the user picked via Google
Picker. The destination is a shared drive folder created by hand in the Drive
UI, and a backend service has no Picker, so the app would have no handle on it
and setting it as the upload parent fails.

Shared drives need `supportsAllDrives=true` on every call. Without it Drive
reports a folder that plainly exists as "not found", which reads like a wrong ID
and isn't.
"""
import json
import logging
from typing import Optional

import httpx

from ..config import settings
from . import google_auth

logger = logging.getLogger(__name__)

_BOUNDARY = "dp-drive-boundary-7f3a1c"


def _base() -> str:
    """googleapis.com, unless pointed at a stub for testing (settings.drive_api_base)."""
    return settings.drive_api_base.rstrip("/")


def is_configured() -> bool:
    """Whether uploading is possible at all: switched on, a destination set, and
    a credential to authenticate with."""
    return bool(settings.drive_enabled and settings.drive_folder_id and settings.gmail_refresh_token)


async def upload_pdf(
    file_name: str,
    content: bytes,
    parent_folder_id: Optional[str] = None,
) -> dict:
    """Upload one PDF and return {"id", "name", "webViewLink"}.

    Multipart upload: one request carrying the metadata and the bytes together,
    which is what Drive recommends for anything under ~5MB and keeps this to a
    single round trip. Raises on any non-2xx — the caller decides whether an
    upload failure should be fatal.
    """
    token = await google_auth.get_access_token()
    parent = parent_folder_id or settings.drive_folder_id

    metadata = {"name": file_name, "parents": [parent]}
    body = (
        f"--{_BOUNDARY}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{_BOUNDARY}\r\n"
        "Content-Type: application/pdf\r\n\r\n"
    ).encode() + content + f"\r\n--{_BOUNDARY}--\r\n".encode()

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{_base()}/upload/drive/v3/files",
            params={
                "uploadType": "multipart",
                # Required for a shared drive destination.
                "supportsAllDrives": "true",
                "fields": "id,name,webViewLink",
            },
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": f"multipart/related; boundary={_BOUNDARY}",
            },
            content=body,
        )
        resp.raise_for_status()
        return resp.json()


async def find_in_folder(file_name: str, parent_folder_id: Optional[str] = None) -> Optional[dict]:
    """An existing file of this exact name in the destination, if any.

    Drive permits duplicate names in one folder, so "already uploaded" has to be
    asked rather than assumed. Used to keep re-runs idempotent without deleting
    or versioning anything.
    """
    token = await google_auth.get_access_token()
    parent = parent_folder_id or settings.drive_folder_id
    escaped = file_name.replace("\\", "\\\\").replace("'", "\\'")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{_base()}/drive/v3/files",
            params={
                "q": f"name = '{escaped}' and '{parent}' in parents and trashed = false",
                "fields": "files(id,name,webViewLink)",
                "supportsAllDrives": "true",
                # Both required for a shared drive to be searched at all.
                "includeItemsFromAllDrives": "true",
                "corpora": "allDrives",
                "pageSize": "1",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        files = resp.json().get("files") or []
        return files[0] if files else None


async def check_access(parent_folder_id: Optional[str] = None) -> dict:
    """Diagnostic: can we actually see the destination?

    Separates the three failure modes that all surface as a 403/404 otherwise —
    Drive API not enabled on the project, the scope missing from the token, or
    the account not being a member of the shared drive.
    """
    parent = parent_folder_id or settings.drive_folder_id
    token = await google_auth.get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{_base()}/drive/v3/files/{parent}",
            params={"fields": "id,name,mimeType,driveId,capabilities", "supportsAllDrives": "true"},
            headers=headers,
        )
        if resp.status_code >= 400:
            return {"ok": False, "status": resp.status_code, "detail": resp.text[:400]}
        folder = resp.json()

        # A shared drive's ROOT reports itself as a folder literally named
        # "Drive" — the human name lives on the drives resource, not on files.
        # Fetch it so this diagnostic names the destination the user recognises
        # instead of something that looks like the wrong folder.
        drive_name = None
        drive_id = folder.get("driveId")
        if drive_id:
            d = await client.get(f"{_base()}/drive/v3/drives/{drive_id}",
                                 params={"fields": "id,name"}, headers=headers)
            if d.status_code < 400:
                drive_name = d.json().get("name")

        caps = folder.get("capabilities") or {}
        return {
            "ok": True,
            "folder": folder,
            "shared_drive_name": drive_name,
            # What this credential may actually do here. canAddChildren is the
            # one uploading depends on.
            "can_upload": caps.get("canAddChildren"),
        }

"""
Shared helpers for the v1 routers.

Before this module, `_envelope` was copy-pasted into 16 routers, `_oid` into
10, and the `_require_editor` / `_require_admin` / `_unwrap_fixture` /
`_extract_field` helpers into several more — all byte-identical. They now live
here once.

`_oid` keeps every caller's exact 400 message via the `entity` label
(invoice routers → "Invalid invoice ID", admin → "Invalid user ID",
tenants → "Invalid ID").
"""
from bson import ObjectId
from fastapi import HTTPException


def _envelope(data=None, error=None):
    return {"data": data, "error": error}


def _oid(value: str, entity: str = "invoice ID") -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {entity}")


def _require_editor(current_user):
    if current_user.role not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _require_admin(current_user):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _unwrap_fixture(data) -> dict:
    """Fixture files are stored as a single-element list from n8n — unwrap."""
    if isinstance(data, list) and len(data) > 0:
        return data[0]
    if isinstance(data, dict):
        return data
    return {}


def _extract_field(invoice_schema: dict, field: str):
    for m in invoice_schema.get("metadata", []):
        if m.get("field") == field:
            return m.get("value") or None
    return None

"""Tenant management endpoints (admin only)."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import tenants, users

router = APIRouter(tags=["tenants"])


from ._common import _envelope, _oid, _require_admin


def _ser_tenant(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "slug": doc.get("slug", ""),
        "name": doc.get("name", ""),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at", "").isoformat() if doc.get("created_at") else None,
        "updated_at": doc.get("updated_at", "").isoformat() if doc.get("updated_at") else None,
    }


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ── GET /api/v1/tenants ───────────────────────────────────────────────────────

@router.get("/tenants")
async def list_tenants(current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()
    cursor = tenants(db).find({}).sort("created_at", 1)
    docs = await cursor.to_list(length=200)

    # Attach user count per tenant
    result = []
    for doc in docs:
        count = await users(db).count_documents({"tenant_id": doc["_id"]})
        entry = _ser_tenant(doc)
        entry["user_count"] = count
        result.append(entry)

    return _envelope(data=result)


# ── POST /api/v1/tenants ──────────────────────────────────────────────────────

class CreateTenantRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name is required")
        return v.strip()


@router.post("/tenants")
async def create_tenant(body: CreateTenantRequest, current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()

    slug = _slugify(body.name)
    if await tenants(db).find_one({"slug": slug}):
        raise HTTPException(status_code=409, detail="A tenant with that name already exists")

    now = datetime.now(timezone.utc)
    doc = {
        "slug": slug,
        "name": body.name,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await tenants(db).insert_one(doc)
    doc["_id"] = result.inserted_id
    return _envelope(data=_ser_tenant(doc))


# ── PATCH /api/v1/tenants/{id} ────────────────────────────────────────────────

class UpdateTenantRequest(BaseModel):
    name: str | None = None
    is_active: bool | None = None


@router.patch("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, body: UpdateTenantRequest, current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()
    oid = _oid(tenant_id, "ID")

    doc = await tenants(db).find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = datetime.now(timezone.utc)
    patch: dict = {"updated_at": now}
    if body.name is not None:
        new_slug = _slugify(body.name)
        existing = await tenants(db).find_one({"slug": new_slug, "_id": {"$ne": oid}})
        if existing:
            raise HTTPException(status_code=409, detail="Name already taken")
        patch["name"] = body.name
        patch["slug"] = new_slug
    if body.is_active is not None:
        patch["is_active"] = body.is_active

    await tenants(db).update_one({"_id": oid}, {"$set": patch})
    updated = await tenants(db).find_one({"_id": oid})
    return _envelope(data=_ser_tenant(updated))

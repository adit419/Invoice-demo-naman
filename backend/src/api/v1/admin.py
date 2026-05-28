"""Admin endpoints: user management."""
from datetime import datetime, timezone

import bcrypt
from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from ...auth.deps import CurrentUser
from ...database import get_db
from ...db.collections import tenants, users

router = APIRouter(tags=["admin"])


from ._common import _envelope, _oid, _require_admin


def _hash(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def _ser_user(doc: dict, tenant_name: str | None = None) -> dict:
    last_login = doc.get("last_login_at")
    tid = doc.get("tenant_id")
    return {
        "id": str(doc["_id"]),
        "email": doc.get("email", ""),
        "full_name": doc.get("full_name", ""),
        "role": doc.get("role", "viewer"),
        "is_active": doc.get("is_active", True),
        "tenant_id": str(tid) if tid else None,
        "tenant_name": tenant_name,
        "last_login_at": last_login.isoformat() if last_login else None,
        "created_at": doc.get("created_at", "").isoformat() if doc.get("created_at") else None,
        "page_access": doc.get("page_access", []),
        "ar_sub_access": doc.get("ar_sub_access", []),
    }


# ── GET /api/v1/admin/users ───────────────────────────────────────────────────

async def _enrich_users(db, docs: list) -> list:
    """Attach tenant_name to each user doc."""
    tenant_ids = list({d["tenant_id"] for d in docs if d.get("tenant_id")})
    tenant_map: dict = {}
    if tenant_ids:
        cursor = tenants(db).find({"_id": {"$in": tenant_ids}})
        for t in await cursor.to_list(length=200):
            tenant_map[t["_id"]] = t.get("name", "")
    return [_ser_user(d, tenant_map.get(d.get("tenant_id"))) for d in docs]


@router.get("/admin/users")
async def list_users(current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()
    cursor = users(db).find({}).sort("created_at", 1)
    docs = await cursor.to_list(length=200)
    return _envelope(data=await _enrich_users(db, docs))


# ── POST /api/v1/admin/users ──────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    password: str
    tenant_id: str | None = None
    page_access: list[str] = []
    ar_sub_access: list[str] = []

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("admin", "editor", "viewer"):
            raise ValueError("role must be admin, editor, or viewer")
        return v

    @field_validator("password")
    @classmethod
    def min_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("password must be at least 6 characters")
        return v


@router.post("/admin/users")
async def invite_user(body: InviteRequest, current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()

    if await users(db).find_one({"email": body.email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    # Admin users must always be associated to a tenant
    if body.role == "admin" and not body.tenant_id:
        raise HTTPException(status_code=422, detail="tenant_id is required when creating an admin user")

    tenant_oid = None
    tenant_name = None
    if body.tenant_id:
        try:
            tenant_oid = ObjectId(body.tenant_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid tenant ID")
        t = await tenants(db).find_one({"_id": tenant_oid})
        if not t:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tenant_name = t.get("name")

    now = datetime.now(timezone.utc)
    doc = {
        "email": body.email,
        "full_name": body.full_name,
        "role": body.role,
        "password_hash": _hash(body.password),
        "is_active": True,
        "tenant_id": tenant_oid,
        "page_access": body.page_access,
        "ar_sub_access": body.ar_sub_access,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }
    result = await users(db).insert_one(doc)
    new_id = result.inserted_id

    doc["_id"] = new_id
    return _envelope(data=_ser_user(doc, tenant_name))


# ── PATCH /api/v1/admin/users/{id} ───────────────────────────────────────────

class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    tenant_id: str | None = None  # pass "" to unassign
    page_access: list[str] | None = None
    ar_sub_access: list[str] | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ("admin", "editor", "viewer"):
            raise ValueError("role must be admin, editor, or viewer")
        return v


@router.patch("/admin/users/{user_id}")
async def update_user(user_id: str, body: UpdateUserRequest, current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()
    uid = _oid(user_id, "user ID")

    doc = await users(db).find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    patch: dict = {"updated_at": now}
    if body.role is not None:
        patch["role"] = body.role
    if body.is_active is not None:
        patch["is_active"] = body.is_active
    if body.tenant_id is not None:
        if body.tenant_id == "":
            patch["tenant_id"] = None
        else:
            try:
                t_oid = ObjectId(body.tenant_id)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid tenant ID")
            t = await tenants(db).find_one({"_id": t_oid})
            if not t:
                raise HTTPException(status_code=404, detail="Tenant not found")
            patch["tenant_id"] = t_oid
    if body.page_access is not None:
        patch["page_access"] = body.page_access
    if body.ar_sub_access is not None:
        patch["ar_sub_access"] = body.ar_sub_access

    await users(db).update_one({"_id": uid}, {"$set": patch})

    updated = await users(db).find_one({"_id": uid})
    enriched = await _enrich_users(db, [updated])
    return _envelope(data=enriched[0])


# ── DELETE /api/v1/admin/users/{id} ──────────────────────────────────────────

@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: CurrentUser):
    _require_admin(current_user)
    db = get_db()
    uid = _oid(user_id, "user ID")

    if str(uid) == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    doc = await users(db).find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    await users(db).delete_one({"_id": uid})
    return _envelope(data={"id": user_id})


# ── POST /api/v1/admin/users/{id}/assign ─────────────────────────────────────

class AssignTenantRequest(BaseModel):
    tenant_id: str
    role: str

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("editor", "viewer"):
            raise ValueError("role must be editor or viewer")
        return v


@router.post("/admin/users/{user_id}/assign")
async def assign_tenant(user_id: str, body: AssignTenantRequest, current_user: CurrentUser):
    """Assign a tenant and role (viewer|editor) to a pending user."""
    _require_admin(current_user)
    db = get_db()
    uid = _oid(user_id, "user ID")

    doc = await users(db).find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        t_oid = ObjectId(body.tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    t = await tenants(db).find_one({"_id": t_oid})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = datetime.now(timezone.utc)
    await users(db).update_one(
        {"_id": uid},
        {"$set": {"tenant_id": t_oid, "role": body.role, "updated_at": now}},
    )

    updated = await users(db).find_one({"_id": uid})
    enriched = await _enrich_users(db, [updated])
    return _envelope(data=enriched[0])

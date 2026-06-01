"""
Settings endpoints: People management, Invite flow, Role Permissions.

Routes (all under /api/v1/settings):
  GET    /people                     — list users + pending invites (manager)
  POST   /invite                     — create & send invite link (tenant_admin)
  POST   /invites/{id}/resend        — regenerate invite token (tenant_admin)
  DELETE /invites/{id}               — revoke invite (tenant_admin)
  PATCH  /users/{id}                 — update role / active status (manager)
  DELETE /users/{id}                 — remove user from tenant (tenant_admin)
  GET    /invite/{token}             — validate invite token (public)
  POST   /invite/{token}/accept      — accept invite, set password (public)
  GET    /role-permissions           — get per-role page-access defaults (manager)
  PUT    /role-permissions           — update per-role page-access defaults (tenant_admin)
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from bson import ObjectId
from fastapi import APIRouter, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, field_validator

from ...auth.deps import CurrentUser
from ...config import settings as app_settings
from ...database import get_db
from ...db.collections import tenants, users
from ._common import _envelope, _oid, _require_admin, _require_tenant_admin, _require_manager

router = APIRouter(prefix="/settings", tags=["settings"])

INVITE_TOKEN_EXPIRE_DAYS = 7
INVITE_ALGORITHM = "HS256"
INVITE_TYPE = "invite"


# ── DB collection helpers ─────────────────────────────────────────────────────

def _invites(db):
    return db["invites"]


def _audit_log(db):
    return db["audit_log"]


# ── Audit log helper ──────────────────────────────────────────────────────────

async def _log(db, *, actor_id: str, actor_email: str, action: str,
               tenant_id=None, target_id: str | None = None,
               target_email: str | None = None, details: dict | None = None):
    await _audit_log(db).insert_one({
        "tenant_id": tenant_id,
        "actor_id": actor_id,
        "actor_email": actor_email,
        "action": action,
        "target_id": target_id,
        "target_email": target_email,
        "details": details or {},
        "created_at": datetime.now(timezone.utc),
    })


# ── Invite token helpers ──────────────────────────────────────────────────────

def _create_invite_token(invite_id: str, email: str, jti: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": invite_id,
        "email": email,
        "type": INVITE_TYPE,
        "jti": jti,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, app_settings.secret_key, algorithm=INVITE_ALGORITHM)


def _decode_invite_token(token: str) -> dict:
    payload = jwt.decode(token, app_settings.secret_key, algorithms=[INVITE_ALGORITHM])
    if payload.get("type") != INVITE_TYPE:
        raise ValueError("Not an invite token")
    return payload


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ── Serializers ───────────────────────────────────────────────────────────────

def _ser_user(doc: dict, tenant_name: str | None = None) -> dict:
    last_login = doc.get("last_login_at")
    tid = doc.get("tenant_id")
    return {
        "id": str(doc["_id"]),
        "email": doc.get("email", ""),
        "full_name": doc.get("full_name", ""),
        "role": doc.get("role", "member"),
        "is_active": doc.get("is_active", True),
        "tenant_id": str(tid) if tid else None,
        "tenant_name": tenant_name,
        "last_login_at": last_login.isoformat() if last_login else None,
        "created_at": doc.get("created_at", "").isoformat() if doc.get("created_at") else None,
    }


def _ser_invite(doc: dict, invited_by_email: str | None = None) -> dict:
    exp = doc.get("expires_at")
    now = datetime.now(timezone.utc)
    # Compute expires_in_hours
    if exp and doc.get("status") == "pending":
        delta = exp - now
        hours_left = max(0, int(delta.total_seconds() / 3600))
    else:
        hours_left = 0

    return {
        "id": str(doc["_id"]),
        "email": doc.get("email", ""),
        "role": doc.get("role", "member"),
        "tenant_id": str(doc["tenant_id"]) if doc.get("tenant_id") else None,
        "invited_by_email": doc.get("invited_by_email") or invited_by_email,
        "status": doc.get("status", "pending"),
        "created_at": doc.get("created_at", "").isoformat() if doc.get("created_at") else None,
        "expires_at": exp.isoformat() if exp else None,
        "expires_in_hours": hours_left,
        "accepted_at": doc.get("accepted_at").isoformat() if doc.get("accepted_at") else None,
    }


# ── GET /settings/people ──────────────────────────────────────────────────────

@router.get("/people")
async def get_people(current_user: CurrentUser):
    _require_manager(current_user)
    db = get_db()

    # Scope to actor's tenant
    tenant_filter: dict = {}
    eff_tid = current_user.active_tenant_id or current_user.tenant_id
    if eff_tid:
        try:
            t_oid = ObjectId(eff_tid)
            tenant_filter = {"tenant_id": t_oid}
        except Exception:
            pass

    # Load users
    user_docs = await users(db).find(tenant_filter).sort("created_at", 1).to_list(length=500)

    # Attach tenant names
    tenant_ids = list({d["tenant_id"] for d in user_docs if d.get("tenant_id")})
    tenant_map: dict = {}
    if tenant_ids:
        async for t in tenants(db).find({"_id": {"$in": tenant_ids}}):
            tenant_map[t["_id"]] = t.get("name", "")

    serialized_users = [_ser_user(d, tenant_map.get(d.get("tenant_id"))) for d in user_docs]

    # Load pending invites for the same tenant scope
    invite_filter: dict = {"status": "pending"}
    if tenant_filter:
        invite_filter["tenant_id"] = tenant_filter["tenant_id"]
    now = datetime.now(timezone.utc)
    invite_filter["expires_at"] = {"$gt": now}

    invite_docs = await _invites(db).find(invite_filter).sort("created_at", -1).to_list(length=200)
    serialized_invites = [_ser_invite(d) for d in invite_docs]

    return _envelope(data={
        "users": serialized_users,
        "pending_invites": serialized_invites,
    })


# ── POST /settings/invite ─────────────────────────────────────────────────────

class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str = "member"

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("tenant_admin", "workspace_admin", "reviewer", "member"):
            raise ValueError("role must be tenant_admin, workspace_admin, reviewer, or member")
        return v


@router.post("/invite")
async def send_invite(body: InviteUserRequest, current_user: CurrentUser):
    _require_tenant_admin(current_user)
    db = get_db()

    # Check if email already registered
    if await users(db).find_one({"email": body.email}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    # Check for existing pending invite
    existing = await _invites(db).find_one({"email": body.email, "status": "pending"})
    if existing:
        exp = existing.get("expires_at")
        if exp and exp > datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="A pending invite already exists for this email")

    eff_tid = current_user.active_tenant_id or current_user.tenant_id
    tenant_oid = ObjectId(eff_tid) if eff_tid else None

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())

    invite_doc = {
        "email": body.email,
        "role": body.role,
        "tenant_id": tenant_oid,
        "invited_by_id": current_user.id,
        "invited_by_email": current_user.email,
        "jti": jti,
        "status": "pending",
        "created_at": now,
        "expires_at": expires_at,
        "accepted_at": None,
        "revoked_at": None,
    }
    result = await _invites(db).insert_one(invite_doc)
    invite_id = str(result.inserted_id)

    token = _create_invite_token(invite_id, body.email, jti)

    await _log(db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="invite_sent",
        tenant_id=tenant_oid,
        target_email=body.email,
        details={"role": body.role, "invite_id": invite_id},
    )

    return _envelope(data={
        "invite_id": invite_id,
        "email": body.email,
        "role": body.role,
        "expires_at": expires_at.isoformat(),
        "invite_token": token,  # Frontend shows this as copy-able link
    })


# ── POST /settings/invites/{id}/resend ───────────────────────────────────────

@router.post("/invites/{invite_id}/resend")
async def resend_invite(invite_id: str, current_user: CurrentUser):
    _require_tenant_admin(current_user)
    db = get_db()

    oid = _oid(invite_id, "invite ID")
    doc = await _invites(db).find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Invite not found")
    if doc.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only resend pending invites")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())
    token = _create_invite_token(invite_id, doc["email"], jti)

    await _invites(db).update_one(
        {"_id": oid},
        {"$set": {"jti": jti, "expires_at": expires_at}},
    )

    await _log(db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="invite_resent",
        tenant_id=doc.get("tenant_id"),
        target_email=doc["email"],
        details={"invite_id": invite_id},
    )

    return _envelope(data={
        "invite_id": invite_id,
        "email": doc["email"],
        "expires_at": expires_at.isoformat(),
        "invite_token": token,
    })


# ── DELETE /settings/invites/{id} ────────────────────────────────────────────

@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, current_user: CurrentUser):
    _require_tenant_admin(current_user)
    db = get_db()

    oid = _oid(invite_id, "invite ID")
    doc = await _invites(db).find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Invite not found")

    now = datetime.now(timezone.utc)
    await _invites(db).update_one(
        {"_id": oid},
        {"$set": {"status": "revoked", "revoked_at": now}},
    )

    await _log(db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="invite_revoked",
        tenant_id=doc.get("tenant_id"),
        target_email=doc["email"],
        details={"invite_id": invite_id},
    )

    return _envelope(data={"id": invite_id, "status": "revoked"})


# ── PATCH /settings/users/{id} ───────────────────────────────────────────────

class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ("tenant_admin", "workspace_admin", "reviewer", "member"):
            raise ValueError("role must be tenant_admin, workspace_admin, reviewer, or member")
        return v


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UpdateUserRequest, current_user: CurrentUser):
    _require_manager(current_user)
    db = get_db()

    uid = _oid(user_id, "user ID")
    doc = await users(db).find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Last-admin protection: if demoting the only tenant_admin
    if body.role is not None and body.role != "tenant_admin" and doc.get("role") == "tenant_admin":
        tid = doc.get("tenant_id")
        admin_count = await users(db).count_documents({"tenant_id": tid, "role": "tenant_admin", "is_active": True})
        if admin_count <= 1 and current_user.role != "tenant_admin":
            raise HTTPException(status_code=400, detail="Cannot remove the last tenant admin from this tenant")

    now = datetime.now(timezone.utc)
    patch: dict = {"updated_at": now}
    details: dict = {}

    if body.role is not None:
        patch["role"] = body.role
        details["old_role"] = doc.get("role")
        details["new_role"] = body.role

    if body.is_active is not None:
        patch["is_active"] = body.is_active
        details["is_active"] = body.is_active

    await users(db).update_one({"_id": uid}, {"$set": patch})

    action = "role_changed" if body.role is not None else "user_status_changed"
    await _log(db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action=action,
        tenant_id=doc.get("tenant_id"),
        target_id=user_id,
        target_email=doc.get("email"),
        details=details,
    )

    updated = await users(db).find_one({"_id": uid})
    return _envelope(data=_ser_user(updated))


# ── DELETE /settings/users/{id} ──────────────────────────────────────────────

@router.delete("/users/{user_id}")
async def remove_user(user_id: str, current_user: CurrentUser):
    _require_tenant_admin(current_user)
    db = get_db()

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove your own account")

    uid = _oid(user_id, "user ID")
    doc = await users(db).find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Last-admin protection
    if doc.get("role") == "tenant_admin":
        tid = doc.get("tenant_id")
        admin_count = await users(db).count_documents({"tenant_id": tid, "role": "tenant_admin", "is_active": True})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last tenant admin from this tenant")

    await users(db).delete_one({"_id": uid})

    await _log(db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="user_removed",
        tenant_id=doc.get("tenant_id"),
        target_id=user_id,
        target_email=doc.get("email"),
        details={"role": doc.get("role")},
    )

    return _envelope(data={"id": user_id})


# ── GET /settings/invite/{token} — PUBLIC ─────────────────────────────────────

@router.get("/invite/{token}", include_in_schema=True)
async def validate_invite(token: str):
    """Validate an invite token — used by the accept-invite page to prefill email/role."""
    db = get_db()
    try:
        payload = _decode_invite_token(token)
    except (JWTError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    invite_id = payload.get("sub")
    jti = payload.get("jti")

    try:
        oid = ObjectId(invite_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invite")

    doc = await _invites(db).find_one({"_id": oid, "jti": jti})
    if not doc:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if doc.get("status") != "pending":
        raise HTTPException(status_code=410, detail="This invite has already been used or revoked")

    exp = doc.get("expires_at")
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invite has expired")

    return _envelope(data={
        "email": doc["email"],
        "role": doc["role"],
        "invited_by_email": doc.get("invited_by_email"),
        "invite_id": invite_id,
    })


# ── POST /settings/invite/{token}/accept — PUBLIC ────────────────────────────

class AcceptInviteRequest(BaseModel):
    full_name: str
    password: str

    @field_validator("password")
    @classmethod
    def min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.post("/invite/{token}/accept")
async def accept_invite(token: str, body: AcceptInviteRequest):
    """Accept an invite — creates user account and marks invite as consumed."""
    db = get_db()

    try:
        payload = _decode_invite_token(token)
    except (JWTError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    invite_id = payload.get("sub")
    email = payload.get("email")
    jti = payload.get("jti")

    try:
        oid = ObjectId(invite_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invite")

    doc = await _invites(db).find_one({"_id": oid, "jti": jti})
    if not doc:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if doc.get("status") != "pending":
        raise HTTPException(status_code=410, detail="This invite has already been used or revoked")

    exp = doc.get("expires_at")
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invite has expired")

    # Check email not already taken (race condition guard)
    if await users(db).find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    now = datetime.now(timezone.utc)
    user_doc = {
        "email": email,
        "password_hash": _hash_password(body.password),
        "full_name": body.full_name,
        "role": doc["role"],
        "is_active": True,
        "tenant_id": doc.get("tenant_id"),
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
        "page_access": [],
        "ar_sub_access": [],
    }
    await users(db).insert_one(user_doc)

    # Mark invite as accepted
    await _invites(db).update_one(
        {"_id": oid},
        {"$set": {"status": "accepted", "accepted_at": now}},
    )

    await _log(db,
        actor_id=str(oid),  # use invite_id as actor since no auth yet
        actor_email=email or "",
        action="invite_accepted",
        tenant_id=doc.get("tenant_id"),
        target_email=email,
        details={"invite_id": invite_id, "role": doc["role"]},
    )

    return _envelope(data={"message": "Account created successfully. You can now sign in."})


# ── GET /settings/role-permissions ──────────────────────────────────────────────

_ALL_PAGES = ["dashboard", "reporting", "arForecast", "cashApplication", "financeOS", "askNeoflo", "vendorOnboarding"]

_DEFAULT_ROLE_PERMS: dict[str, list[str]] = {
    "reviewer": list(_ALL_PAGES),
    "member":   list(_ALL_PAGES),
}


@router.get("/role-permissions")
async def get_role_permissions(current_user: CurrentUser):
    """Return the per-role page-access config for this tenant."""
    _require_manager(current_user)
    db = get_db()

    eff_tid = current_user.active_tenant_id or current_user.tenant_id
    tenant_doc = None
    if eff_tid:
        try:
            tenant_doc = await tenants(db).find_one({"_id": ObjectId(eff_tid)})
        except Exception:
            pass

    stored = (tenant_doc or {}).get("role_permissions", {})
    result = {role: stored.get(role, list(_ALL_PAGES)) for role in ("reviewer", "member")}
    return _envelope(data=result)


# ── PUT /settings/role-permissions ──────────────────────────────────────────────

class RolePermissionsRequest(BaseModel):
    reviewer: list[str] = list(_ALL_PAGES)
    member:   list[str] = list(_ALL_PAGES)


@router.put("/role-permissions")
async def set_role_permissions(body: RolePermissionsRequest, current_user: CurrentUser):
    """Persist per-role page-access defaults (tenant_admin only)."""
    _require_tenant_admin(current_user)
    db = get_db()

    eff_tid = current_user.active_tenant_id or current_user.tenant_id
    if not eff_tid:
        raise HTTPException(status_code=400, detail="No tenant context")

    valid_pages = set(_ALL_PAGES)
    perms = {
        "reviewer": [p for p in body.reviewer if p in valid_pages],
        "member":   [p for p in body.member   if p in valid_pages],
    }

    await tenants(db).update_one(
        {"_id": ObjectId(eff_tid)},
        {"$set": {"role_permissions": perms}},
    )

    await _log(db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="role_permissions_updated",
        tenant_id=ObjectId(eff_tid),
        details={"permissions": perms},
    )

    return _envelope(data=perms)


# ── Index definitions (called from ensure_indexes) ─────────────────────────────

async def ensure_settings_indexes(db) -> None:
    from pymongo import ASCENDING, DESCENDING
    await _invites(db).create_index([("email", ASCENDING)])
    await _invites(db).create_index([("status", ASCENDING)])
    await _invites(db).create_index([("jti", ASCENDING)], unique=True, sparse=True)
    await _invites(db).create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="invite_ttl")
    await _audit_log(db).create_index([("tenant_id", ASCENDING), ("created_at", DESCENDING)])
    await _audit_log(db).create_index([("action", ASCENDING)])

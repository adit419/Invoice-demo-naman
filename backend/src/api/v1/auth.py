from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
import bcrypt

from ...auth.deps import CurrentUser
from ...auth.jwt import create_access_token, decode_token
from ...database import get_db
from ...db.collections import tenants, token_blocklist, users
from ...models.user import (
    LoginRequest,
    SignupRequest,
    UserOut,
    user_doc_to_out,
)
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


from ._common import _envelope


async def _enrich_tenant(db, user_out: UserOut) -> UserOut:
    """Attach tenant_name to UserOut if the user belongs to a tenant."""
    if not user_out.tenant_id:
        return user_out
    t = await tenants(db).find_one({"_id": ObjectId(user_out.tenant_id)})
    if t:
        return user_out.model_copy(update={"tenant_name": t.get("name")})
    return user_out


# ── Signup ────────────────────────────────────────────────────────────────────

@router.post("/signup")
async def signup(body: SignupRequest):
    db = get_db()

    if await users(db).find_one({"email": body.email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    now = datetime.now(timezone.utc)
    doc = {
        "email": body.email,
        "password_hash": _hash_password(body.password),
        "full_name": body.full_name,
        "role": "viewer",   # all self-signed accounts start as viewer, no tenant
        "is_active": True,
        "tenant_id": None,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }
    await users(db).insert_one(doc)

    return _envelope(data={"message": "Account created. Your account is pending tenant assignment — please contact your administrator to gain access."})


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    db = get_db()

    doc = await users(db).find_one({"email": body.email})
    if not doc or not _verify_password(body.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")

    now = datetime.now(timezone.utc)
    await users(db).update_one({"_id": doc["_id"]}, {"$set": {"last_login_at": now}})
    doc["last_login_at"] = now

    user_out = await _enrich_tenant(db, user_doc_to_out(doc))
    token = create_access_token(str(doc["_id"]), doc["role"])

    return _envelope(data={"access_token": token, "token_type": "bearer", "user": user_out.model_dump()})


# ── Token (Swagger / docs convenience) ───────────────────────────────────────

@router.post("/token", include_in_schema=False)
async def token(form: OAuth2PasswordRequestForm = Depends()):
    """OAuth2 password flow — powers the Swagger UI Authorize button."""
    db = get_db()
    doc = await users(db).find_one({"email": form.username})
    if not doc or not _verify_password(form.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
    return {
        "access_token": create_access_token(str(doc["_id"]), doc["role"]),
        "token_type": "bearer",
    }


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(current_user: CurrentUser, request: Request):
    db = get_db()
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() or None

    if token:
        try:
            payload = decode_token(token)
            exp = payload.get("exp")
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else datetime.now(timezone.utc)
        except JWTError:
            expires_at = datetime.now(timezone.utc)

        await token_blocklist(db).update_one(
            {"token": token},
            {"$setOnInsert": {"token": token, "expires_at": expires_at}},
            upsert=True,
        )

    return _envelope(data={"message": "Logged out"})


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def me(current_user: CurrentUser):
    db = get_db()
    enriched = await _enrich_tenant(db, current_user)
    # Also enrich active_tenant_name if switching
    if current_user.active_tenant_id:
        t = await tenants(db).find_one({"_id": ObjectId(current_user.active_tenant_id)})
        if t:
            enriched = enriched.model_copy(update={"active_tenant_name": t.get("name")})
    return _envelope(data=enriched.model_dump())


# ── Switch Tenant ─────────────────────────────────────────────────────────────

class SwitchTenantRequest(BaseModel):
    tenant_id: str


@router.post("/switch-tenant")
async def switch_tenant(body: SwitchTenantRequest, current_user: CurrentUser):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can switch tenants")

    db = get_db()
    try:
        t_oid = ObjectId(body.tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    tenant = await tenants(db).find_one({"_id": t_oid})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Issue new token carrying the switched-to tenant
    token = create_access_token(current_user.id, current_user.role, active_tenant_id=body.tenant_id)

    # Build enriched user with active tenant info
    enriched = await _enrich_tenant(db, current_user)
    enriched = enriched.model_copy(update={
        "active_tenant_id": body.tenant_id,
        "active_tenant_name": tenant.get("name"),
    })

    return _envelope(data={"access_token": token, "token_type": "bearer", "user": enriched.model_dump()})

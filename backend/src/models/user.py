from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, EmailStr, field_validator


Role = Literal["admin", "editor", "viewer"]


class UserInDB(BaseModel):
    """Shape stored in MongoDB users collection."""
    id: str
    email: str
    password_hash: str
    full_name: str
    role: Role
    is_active: bool
    tenant_id: str | None = None
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class UserOut(BaseModel):
    """Safe user shape returned to clients — no password_hash."""
    id: str
    email: str
    full_name: str
    role: Role
    is_active: bool
    tenant_id: str | None = None
    tenant_name: str | None = None
    # Set when an admin has switched to view another tenant's data
    active_tenant_id: str | None = None
    active_tenant_name: str | None = None
    created_at: datetime
    last_login_at: datetime | None = None
    page_access: list[str] = []
    ar_sub_access: list[str] = []

    @property
    def effective_tenant_id(self) -> str | None:
        """Tenant used for data scoping — switched-to tenant takes precedence."""
        return self.active_tenant_id or self.tenant_id


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def user_doc_to_out(doc: dict[str, Any]) -> UserOut:
    tid = doc.get("tenant_id")
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        full_name=doc["full_name"],
        role=doc["role"],
        is_active=doc["is_active"],
        tenant_id=str(tid) if tid else None,
        created_at=doc["created_at"],
        last_login_at=doc.get("last_login_at"),
        page_access=doc.get("page_access", []),
        ar_sub_access=doc.get("ar_sub_access", []),
    )

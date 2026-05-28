from typing import Annotated

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from ..auth.jwt import decode_token
from ..database import get_db
from ..db.collections import token_blocklist, users
from ..models.user import Role, UserOut, user_doc_to_out

bearer_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=True)


async def get_current_user(
    token: Annotated[str, Depends(bearer_scheme)],
) -> UserOut:
    db = get_db()

    # Check blocklist
    if await token_blocklist(db).find_one({"token": token}):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    doc = await users(db).find_one({"_id": ObjectId(user_id)})
    if not doc or not doc.get("is_active"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    user_out = user_doc_to_out(doc)

    # Carry active_tenant_id from JWT into the user object for data scoping
    active_tid = payload.get("active_tenant_id")
    if active_tid:
        user_out = user_out.model_copy(update={"active_tenant_id": active_tid})

    return user_out


CurrentUser = Annotated[UserOut, Depends(get_current_user)]


def require_role(*roles: Role):
    """FastAPI dependency factory — returns 403 if user role not in allowed roles."""
    async def _check(current_user: CurrentUser) -> UserOut:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not permitted for this action",
            )
        return current_user
    return Depends(_check)

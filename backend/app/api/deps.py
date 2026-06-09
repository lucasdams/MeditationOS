"""Shared route dependencies."""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.services import user_service

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the authenticated user from the access_token cookie.

    Default-deny: any missing/invalid/expired token, or unknown user, is a 401.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise _UNAUTHORIZED

    user_id = decode_access_token(token)
    if user_id is None:
        raise _UNAUTHORIZED

    user = user_service.get_user_by_id(db, user_id)
    if user is None:
        raise _UNAUTHORIZED
    return user

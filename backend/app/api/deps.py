"""Shared route dependencies."""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.services import user_service

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
)
_EMAIL_UNVERIFIED = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Please confirm your email address to continue.",
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


def require_verified_email(user: User = Depends(get_current_user)) -> None:
    """Router-level gate for data routes: block accounts whose email isn't confirmed
    when REQUIRE_EMAIL_VERIFICATION is on. Guests and Google sign-ins arrive verified,
    so only unconfirmed email/password accounts are stopped (403). A no-op while the
    flag is off (the default) — so it ships dark and is enabled with a single config
    flip once verification email delivery is live. Resolved via the same cached
    get_current_user call the route uses, so it adds no extra DB hit."""
    if settings.require_email_verification and not user.email_verified:
        raise _EMAIL_UNVERIFIED

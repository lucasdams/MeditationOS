"""Shared route dependencies."""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import decode_access_token_payload, password_fingerprint
from app.models.user import User
from app.services import user_service

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
)
_EMAIL_UNVERIFIED = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Please confirm your email address to continue.",
)
_FORBIDDEN = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
)
_DISABLED = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="This account has been disabled. Contact support.",
)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the authenticated user from the access_token cookie.

    Default-deny: any missing/invalid/expired token, or unknown user, is a 401.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise _UNAUTHORIZED

    payload = decode_access_token_payload(token)
    if payload is None:
        raise _UNAUTHORIZED
    user_id = payload.get("sub")
    if user_id is None:
        raise _UNAUTHORIZED

    user = user_service.get_user_by_id(db, user_id)
    if user is None:
        raise _UNAUTHORIZED
    # Session revocation via the password-version (`pwv`) claim: a token is bound to the
    # password it was minted under, so changing the password (settings change-password or
    # the reset-password flow — both rewrite `password_hash`) invalidates every existing
    # access-token cookie for that user. Legacy tokens minted before this change carry no
    # `pwv` and are grandfathered (they expire naturally) so a deploy doesn't mass-logout.
    token_pwv = payload.get("pwv")
    if token_pwv is not None and token_pwv != password_fingerprint(user.password_hash):
        raise _UNAUTHORIZED
    # An admin-disabled account is blocked here, so a still-valid token can't be used to
    # reach any authenticated route (including /auth/me). Enforced at the single choke
    # point every protected route depends on — 403, with a clear message.
    if user.is_disabled:
        raise _DISABLED
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


def today_for_user(user: User = Depends(get_current_user)) -> tuple[date, str]:
    """The authenticated user's current local date + their IANA timezone (falls back to
    UTC for a missing/unknown zone). A single shared dependency for the day-bucketed
    routes (dashboard, goals, sanctuary, analytics) that previously each carried their
    own copy of this helper — behaviour is identical."""
    tz = user.timezone or "UTC"
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        tz, zone = "UTC", ZoneInfo("UTC")
    return datetime.now(zone).date(), tz


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Default-deny admin gate: resolve the authenticated user, then 403 unless their
    email is in the ADMIN_EMAILS allowlist (`User.is_admin`). Apply at the router level
    (`dependencies=[Depends(require_admin)]`) so every admin route is protected — an
    unauthenticated caller still gets 401 from `get_current_user` first."""
    if not user.is_admin:
        raise _FORBIDDEN
    return user

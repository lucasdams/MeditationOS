"""Password hashing. argon2 per docs/design/authentication.md / ADR-0005.

Plaintext passwords are never stored or logged — only the argon2 hash.
"""

import hashlib
from datetime import UTC, datetime, timedelta

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


# A stable fingerprint of a passwordless account (guest / Google-only). Distinct from
# any real password fingerprint (which is a truncated sha256 hex of the hash), so if a
# passwordless account later sets a password its fingerprint changes and old tokens die.
_NO_PASSWORD_PWV = "none"


def password_fingerprint(password_hash: str | None) -> str:
    """A short fingerprint of the user's current credential, used as the `pwv`
    ("password version") claim on tokens.

    For a password account it's a truncated sha256 of the hash: any password change
    yields a new value, invalidating tokens minted under the old password. For a
    passwordless account (guest / Google-only) it's a fixed sentinel — stable so those
    sessions keep working, and distinct from every real fingerprint so setting a
    password for the first time still rotates the value.
    """
    if password_hash is None:
        return _NO_PASSWORD_PWV
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


ACCESS_TOKEN_TYPE = "access"


def create_access_token(
    subject: str, expire_minutes: int | None = None, pwv: str | None = None
) -> str:
    """Sign a short-lived JWT carrying the user id in `sub`. The `type` claim pins
    it as an access token so a reset/verify token (same key, same `sub`) can't be
    swapped in as the auth cookie.

    `expire_minutes` overrides the default lifetime (used by "keep me signed in" to
    issue a longer-lived token); when None the standard access-token expiry applies.

    `pwv` binds the token to the user's current password version (see
    `password_fingerprint`). Every issue site passes it so a password change
    invalidates all outstanding sessions. `get_current_user` now REQUIRES the claim,
    so a token minted without it (a pre-`pwv` legacy cookie) is rejected, not
    grandfathered — only test/legacy call paths omit it."""
    minutes = (
        expire_minutes if expire_minutes is not None
        else settings.access_token_expire_minutes
    )
    expire = datetime.now(UTC) + timedelta(minutes=minutes)
    claims = {"sub": subject, "type": ACCESS_TOKEN_TYPE, "exp": expire}
    if pwv is not None:
        claims["pwv"] = pwv
    return jwt.encode(claims, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Return the `sub` (user id) if the token is a valid access token, else None.
    Rejects tokens of another type (reset/verify) to prevent token confusion.

    Does not check `pwv` — callers that need password-version binding use
    `decode_access_token_payload` and compare the claim against the loaded user."""
    payload = decode_access_token_payload(token)
    return payload.get("sub") if payload is not None else None


def decode_access_token_payload(token: str) -> dict | None:
    """Return the full validated claims of a valid access token, else None.

    Same type/signature checks as `decode_access_token`, but exposes the whole payload
    so `get_current_user` can read the `pwv` claim (absent on legacy tokens)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        return None
    return payload


PASSWORD_RESET_TYPE = "pwreset"


def create_password_reset_token(subject: str, pwv: str) -> str:
    """Sign a short-lived password-reset JWT. `pwv` is a fingerprint of the user's
    current password hash; checking it on use makes the token single-use (any
    password change — including the reset itself — invalidates outstanding links)."""
    expire = datetime.now(UTC) + timedelta(
        minutes=settings.password_reset_expire_minutes
    )
    return jwt.encode(
        {"sub": subject, "pwv": pwv, "type": PASSWORD_RESET_TYPE, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_password_reset_token(token: str) -> tuple[str, str] | None:
    """Return `(subject, pwv)` for a valid, unexpired reset token, else None."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != PASSWORD_RESET_TYPE:
        return None
    sub, pwv = payload.get("sub"), payload.get("pwv")
    if not sub or not pwv:
        return None
    return sub, pwv


EMAIL_VERIFY_TYPE = "emailverify"


def create_email_verification_token(subject: str, email: str) -> str:
    """Sign an email-verification JWT. The `email` claim ties the token to the
    address it was issued for, so it can't confirm a different one."""
    expire = datetime.now(UTC) + timedelta(
        minutes=settings.email_verification_expire_minutes
    )
    return jwt.encode(
        {"sub": subject, "email": email, "type": EMAIL_VERIFY_TYPE, "exp": expire},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_email_verification_token(token: str) -> tuple[str, str] | None:
    """Return `(subject, email)` for a valid, unexpired verification token, else None."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != EMAIL_VERIFY_TYPE:
        return None
    sub, email = payload.get("sub"), payload.get("email")
    if not sub or not email:
        return None
    return sub, email

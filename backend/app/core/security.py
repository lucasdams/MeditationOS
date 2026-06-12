"""Password hashing. argon2 per docs/design/authentication.md / ADR-0005.

Plaintext passwords are never stored or logged — only the argon2 hash.
"""

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


def create_access_token(subject: str) -> str:
    """Sign a short-lived JWT carrying the user id in `sub`."""
    expire = datetime.now(UTC) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode({"sub": subject, "exp": expire}, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Return the `sub` (user id) if the token is valid, else None."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


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

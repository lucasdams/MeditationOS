"""User business logic and data access. Routes call into here; they never
touch the database directly (see docs/decisions/0006-layered-architecture.md).
"""

import hashlib
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import (
    EmailAlreadyExistsError,
    GoogleAuthError,
    InvalidPasswordError,
    InvalidResetTokenError,
    InvalidTimezoneError,
    InvalidVerificationTokenError,
    UsernameTakenError,
)
from app.core.google import verify_id_token
from app.core.security import (
    create_email_verification_token,
    create_password_reset_token,
    decode_email_verification_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import UserCreate
from app.services.notifications import email as email_channel


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def set_username(db: Session, user: User, username: str) -> User:
    """Set the user's public username. Raises if it's taken (case-insensitive)."""
    existing = db.execute(
        select(User).where(User.username == username)
    ).scalar_one_or_none()
    if existing is not None and existing.id != user.id:
        raise UsernameTakenError(username)
    user.username = username
    db.commit()
    db.refresh(user)
    return user


def set_timezone(db: Session, user: User, timezone: str) -> User:
    """Set the user's IANA timezone. Raises if it isn't a valid zone."""
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError) as err:
        raise InvalidTimezoneError(timezone) from err
    user.timezone = timezone
    db.commit()
    db.refresh(user)
    return user


def set_password(
    db: Session, user: User, *, current_password: str | None, new_password: str
) -> User:
    """Change (or, for Google-only accounts, set) the user's password.

    An account that already has a password must confirm it; a passwordless
    (Google-only) account sets one for the first time. Raises InvalidPasswordError
    if the current password is wrong or missing where required.
    """
    if user.password_hash is not None:
        if current_password is None or not verify_password(
            current_password, user.password_hash
        ):
            raise InvalidPasswordError()
    user.password_hash = hash_password(new_password)
    db.commit()
    db.refresh(user)
    return user


def _password_version(password_hash: str) -> str:
    """A short fingerprint of the password hash, embedded in reset tokens so a
    token stops working once the password changes (single-use)."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _reset_email_body(user: User, link: str) -> str:
    name = user.username or "there"
    return (
        f"Hi {name},\n\n"
        "We received a request to reset your MeditationOS password. Choose a new "
        f"one here — the link expires in {settings.password_reset_expire_minutes} "
        f"minutes:\n\n{link}\n\n"
        "If you didn't request this, you can safely ignore this email; your "
        "password won't change.\n\n"
        "— MeditationOS"
    )


def request_password_reset(db: Session, email: str) -> None:
    """Email a reset link if `email` belongs to a password account. Silent by
    design — the caller responds identically whether or not a user matched, so the
    endpoint can't be used to enumerate accounts. Google-only accounts (no
    password) get nothing: they sign in with Google."""
    user = get_user_by_email(db, email)
    if user is None or user.password_hash is None:
        return
    token = create_password_reset_token(str(user.id), _password_version(user.password_hash))
    link = f"{settings.app_base_url}/reset-password?token={token}"
    email_channel.send_email(
        user.email, "Reset your MeditationOS password", _reset_email_body(user, link)
    )


def reset_password(db: Session, token: str, new_password: str) -> None:
    """Set a new password from a valid reset token. Raises InvalidResetTokenError
    if the token is malformed, expired, or already used (the embedded password
    fingerprint no longer matches)."""
    decoded = decode_password_reset_token(token)
    if decoded is None:
        raise InvalidResetTokenError()
    sub, pwv = decoded
    user = get_user_by_id(db, sub)
    if (
        user is None
        or user.password_hash is None
        or _password_version(user.password_hash) != pwv
    ):
        raise InvalidResetTokenError()
    user.password_hash = hash_password(new_password)
    db.commit()


def _verification_email_body(user: User, link: str) -> str:
    name = user.username or "there"
    return (
        f"Hi {name},\n\n"
        "Welcome to MeditationOS! Please confirm your email address by clicking the "
        f"link below:\n\n{link}\n\n"
        "If you didn't create this account, you can ignore this email.\n\n"
        "— MeditationOS"
    )


def send_verification_email(db: Session, user: User) -> None:
    """Email a confirmation link, unless the address is already verified. Used at
    registration and on resend. Silent for already-verified accounts."""
    if user.email_verified:
        return
    token = create_email_verification_token(str(user.id), user.email)
    link = f"{settings.app_base_url}/verify-email?token={token}"
    email_channel.send_email(
        user.email, "Confirm your MeditationOS email", _verification_email_body(user, link)
    )


def verify_email(db: Session, token: str) -> None:
    """Mark the user's email verified from a valid token. Idempotent. Raises
    InvalidVerificationTokenError if the token is malformed, expired, or no longer
    matches the account's current email."""
    decoded = decode_email_verification_token(token)
    if decoded is None:
        raise InvalidVerificationTokenError()
    sub, token_email = decoded
    user = get_user_by_id(db, sub)
    if user is None or user.email.lower() != token_email.lower():
        raise InvalidVerificationTokenError()
    if not user.email_verified:
        user.email_verified = True
        db.commit()


def get_user_by_id(db: Session, user_id: str) -> User | None:
    try:
        pk = uuid.UUID(user_id)
    except (ValueError, TypeError):
        return None
    return db.get(User, pk)


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the user if credentials are valid, else None (no enumeration hint)."""
    user = get_user_by_email(db, email)
    # A Google-only account has no password_hash — it can't be logged into with one.
    if user is None or user.password_hash is None or not verify_password(
        password, user.password_hash
    ):
        return None
    return user


def login_with_google(db: Session, credential: str) -> User:
    """Verify a Google ID token and return the matching user, creating or linking
    one as needed. Raises GoogleAuthError if the token is invalid/unverified.

    Resolution order:
    1. an account already linked to this Google identity (`google_sub`);
    2. an existing account with the same (Google-verified) email — link it;
    3. otherwise a brand-new, passwordless account.
    """
    try:
        claims = verify_id_token(credential)
    except ValueError as err:
        raise GoogleAuthError(str(err)) from err

    if not claims.get("email_verified"):
        raise GoogleAuthError("Google email is not verified")

    google_sub = claims["sub"]
    email = claims["email"]

    # Google has verified the email, so any account it resolves to is verified.
    user = db.execute(
        select(User).where(User.google_sub == google_sub)
    ).scalar_one_or_none()
    if user is not None:
        if not user.email_verified:
            user.email_verified = True
            db.commit()
            db.refresh(user)
        return user

    user = get_user_by_email(db, email)
    if user is not None:
        user.google_sub = google_sub  # link the verified Google identity
        user.email_verified = True
        db.commit()
        db.refresh(user)
        return user

    user = User(
        email=email, google_sub=google_sub, password_hash=None, email_verified=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_user(db: Session, data: UserCreate) -> User:
    """Create a user, hashing the password, and email a verification link. Raises
    if the email is taken."""
    if get_user_by_email(db, data.email) is not None:
        raise EmailAlreadyExistsError(data.email)

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    send_verification_email(db, user)
    return user

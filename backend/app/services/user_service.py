"""User business logic and data access. Routes call into here; they never
touch the database directly (see docs/decisions/0006-layered-architecture.md).
"""

import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    EmailAlreadyExistsError,
    GoogleAuthError,
    InvalidTimezoneError,
    UsernameTakenError,
)
from app.core.google import verify_id_token
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import UserCreate


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

    user = db.execute(
        select(User).where(User.google_sub == google_sub)
    ).scalar_one_or_none()
    if user is not None:
        return user

    user = get_user_by_email(db, email)
    if user is not None:
        user.google_sub = google_sub  # link the verified Google identity
        db.commit()
        db.refresh(user)
        return user

    user = User(email=email, google_sub=google_sub, password_hash=None)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_user(db: Session, data: UserCreate) -> User:
    """Create a user, hashing the password. Raises if the email is taken."""
    if get_user_by_email(db, data.email) is not None:
        raise EmailAlreadyExistsError(data.email)

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

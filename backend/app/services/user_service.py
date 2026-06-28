"""User business logic and data access. Routes call into here; they never
touch the database directly (see docs/decisions/0006-layered-architecture.md).
"""

import hashlib
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import (
    EmailAlreadyExistsError,
    GoogleAuthError,
    InvalidPasswordError,
    InvalidQuestFeaturesError,
    InvalidResetTokenError,
    InvalidTimezoneError,
    InvalidVerificationTokenError,
    NotAGuestError,
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
from app.models.biometric_reading import BiometricReading
from app.models.breathing_pattern import BreathingPattern
from app.models.goal import Goal, GoalCheckin
from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.mood_log import MoodLog
from app.models.path_enrollment import PathEnrollment
from app.models.scheduled_session import ScheduledSession
from app.models.session import Session as PracticeSession
from app.models.spirit import Spirit
from app.models.user import QUEST_FEATURES, User
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
    try:
        db.commit()
    except IntegrityError:  # lost a race to the unique username constraint
        db.rollback()
        raise UsernameTakenError(username) from None
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


# A user must opt into at least this many daily-activity quests.
MIN_QUEST_FEATURES = 3


def set_quest_features(db: Session, user: User, features: list[str]) -> User:
    """Set which daily-activity quests the user receives. Raises
    InvalidQuestFeaturesError if any value is unknown or fewer than the minimum
    (3) distinct ones are chosen. Stored in canonical order, de-duplicated."""
    unknown = [f for f in features if f not in QUEST_FEATURES]
    if unknown:
        raise InvalidQuestFeaturesError(f"unknown quest features: {unknown}")
    chosen = [f for f in QUEST_FEATURES if f in set(features)]  # canonical order, deduped
    if len(chosen) < MIN_QUEST_FEATURES:
        raise InvalidQuestFeaturesError(
            f"choose at least {MIN_QUEST_FEATURES} quest features"
        )
    user.quest_features = chosen
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


def change_email(db: Session, user: User, *, new_email: str, current_password: str) -> User:
    """Change the account email after re-authenticating with the current password.
    Resets verification and emails a confirmation link to the new address.

    Raises InvalidPasswordError if the password is wrong (or the account has none,
    e.g. Google-only — it must set a password first), or EmailAlreadyExistsError if
    another account already uses the new email. A no-op if the email is unchanged.
    """
    if user.password_hash is None or not verify_password(current_password, user.password_hash):
        raise InvalidPasswordError()
    if user.email.lower() == new_email.lower():
        return user  # unchanged — don't reset verification or re-send
    existing = get_user_by_email(db, new_email)
    if existing is not None and existing.id != user.id:
        raise EmailAlreadyExistsError(new_email)
    user.email = new_email
    user.email_verified = False
    try:
        db.commit()
    except IntegrityError:  # lost a race to the unique email constraint
        db.rollback()
        raise EmailAlreadyExistsError(new_email) from None
    db.refresh(user)
    send_verification_email(db, user)
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
    """Return the user if credentials are valid, else None (no enumeration hint).

    A disabled account never authenticates — even with correct credentials — so an
    admin suspension can't be bypassed by logging in again for a fresh cookie.
    """
    user = get_user_by_email(db, email)
    # A Google-only account has no password_hash — it can't be logged into with one.
    if user is None or user.password_hash is None or not verify_password(
        password, user.password_hash
    ):
        return None
    if user.is_disabled:
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
        if user.is_disabled:
            raise GoogleAuthError("account disabled")
        if not user.email_verified:
            user.email_verified = True
            db.commit()
            db.refresh(user)
        return user

    user = get_user_by_email(db, email)
    if user is not None:
        if user.is_disabled:
            raise GoogleAuthError("account disabled")
        user.google_sub = google_sub  # link the verified Google identity
        user.email_verified = True
        try:
            db.commit()
        except IntegrityError:
            # A near-simultaneous first-time Google login linked/created this identity
            # first and won the race on the unique google_sub. Roll back and re-resolve
            # to that now-existing account — idempotent retry (mirrors create_session).
            db.rollback()
            return _resolve_google_user(db, google_sub, email)
        db.refresh(user)
        return user

    user = User(
        email=email, google_sub=google_sub, password_hash=None, email_verified=True
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent first-time login created the account (unique google_sub/email)
        # first — recover idempotently by returning that account rather than 500-ing.
        db.rollback()
        return _resolve_google_user(db, google_sub, email)
    db.refresh(user)
    return user


def _resolve_google_user(db: Session, google_sub: str, email: str) -> User:
    """Re-fetch the account that won a concurrent first-time Google login: by google_sub
    first, then by email. Used to recover idempotently from a unique-constraint race."""
    user = db.execute(
        select(User).where(User.google_sub == google_sub)
    ).scalar_one_or_none()
    if user is None:
        user = get_user_by_email(db, email)
    if user is None:
        # The colliding row vanished between rollback and re-read — surface a clean auth
        # error rather than returning None (the caller's type is non-optional).
        raise GoogleAuthError("could not resolve Google account after a concurrent login")
    if user.is_disabled:
        raise GoogleAuthError("account disabled")
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


def create_guest(db: Session) -> User:
    """Create an anonymous "try it" account: a synthetic email + auto username, no
    password. email_verified is true so the (fake) address never prompts a verify
    banner. The user can later claim_account() to make it real."""
    handle = uuid.uuid4().hex[:12]
    user = User(
        email=f"guest_{handle}@guest.meditationos.app",
        username=f"guest_{handle}",
        password_hash=None,
        email_verified=True,
        is_guest=True,
        # Seed the full quest set so "try without signup" skips the picker.
        quest_features=list(QUEST_FEATURES),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def claim_account(db: Session, user: User, email: str, password: str) -> User:
    """Convert a guest into a real account: set a real email + password, keeping all
    their data. Raises NotAGuestError if the account isn't a guest, or
    EmailAlreadyExistsError if the email is taken. Sends an email verification."""
    if not user.is_guest:
        raise NotAGuestError()
    existing = get_user_by_email(db, email)
    if existing is not None and existing.id != user.id:
        raise EmailAlreadyExistsError(email)
    user.email = email
    user.password_hash = hash_password(password)
    user.is_guest = False
    user.email_verified = False
    try:
        db.commit()
    except IntegrityError:  # lost a race to the unique email constraint (concurrent claim)
        db.rollback()
        raise EmailAlreadyExistsError(email) from None
    db.refresh(user)
    send_verification_email(db, user)
    return user


def _dump(rows: list) -> list[dict]:
    """Serialize ORM rows to plain dicts of their columns (for data export)."""
    return [{c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows]


# User-owned tables deliberately kept OUT of the portable export. `push_subscriptions`
# holds browser push credentials (endpoint + keys) — device-bound credential material,
# not portable content. `audit_logs` is operational/security record, not user content.
# Listed explicitly so the drift-guard test (tests/test_export_drift.py) treats the
# omission as intentional rather than an accidental gap.
_EXPORT_EXCLUDED = {"push_subscriptions", "audit_logs"}


def export_user_data(db: Session, user: User) -> dict:
    """A full, portable snapshot of everything the user owns (minus the password
    hash). FastAPI's encoder handles the UUID/datetime values."""

    def owned(model):
        # `user_id == user.id` naturally excludes global presets (NULL user_id), e.g.
        # the shared breathing patterns — only the user's own rows are exported.
        return _dump(
            db.execute(select(model).where(model.user_id == user.id)).scalars().all()
        )

    account = {
        c.name: getattr(user, c.name)
        for c in User.__table__.columns
        if c.name != "password_hash"
    }
    return {
        "account": account,
        "sessions": owned(PracticeSession),
        "gratitude": owned(GratitudeEntry),
        "journals": owned(Journal),
        "mood_logs": owned(MoodLog),
        "goals": owned(Goal),
        "goal_checkins": owned(GoalCheckin),
        "spirits": owned(Spirit),
        "biometric_readings": owned(BiometricReading),
        "scheduled_sessions": owned(ScheduledSession),
        "breathing_patterns": owned(BreathingPattern),
        "path_enrollments": owned(PathEnrollment),
    }


def delete_user(db: Session, user: User) -> None:
    """Permanently delete the account. All user-owned rows cascade via their FKs
    (global breathing presets, with no user_id, are untouched)."""
    db.delete(user)
    db.commit()

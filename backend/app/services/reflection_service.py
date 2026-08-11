"""AI reflection business logic. One reflection per journal entry, generated once
and then reused; generation is capped per user per day (LLM cost control). All
queries scoped to the user — a journal that isn't the caller's behaves as missing."""

import uuid
import zlib

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import GuestNotAllowedError
from app.core.limits import enforce_daily_create_cap
from app.models.ai_reflection import AIReflection
from app.models.journal import Journal
from app.models.user import User
from app.services._ownership import get_owned
from app.services.ai import reflection_coach

# Tighter than the general anti-spam ceiling: each NEW reflection is an LLM call, so
# generation is capped low (re-reading an existing reflection is never counted).
REFLECTION_DAILY_LIMIT = 10

# Distinct namespace for the per-user reflection-generation advisory lock. Using the
# two-int4 form of pg_advisory_xact_lock keeps it in a different lock space from the
# single-int8 advisory locks elsewhere (spirit writes, cron jobs); the explicit
# namespace makes that separation intentional rather than incidental.
_ADVISORY_LOCK_NAMESPACE = 0x5245464C  # ASCII "REFL"


def _lock_user_generation(db: DBSession, user_id: uuid.UUID) -> None:
    """Serialize one user's reflection *generation* with a transaction-scoped Postgres
    advisory lock, so the daily-cap COUNT and the INSERT/commit are atomic per user —
    without it, N concurrent first-requests for N different journals could all read a
    count below the cap and each generate (blowing the cap and the LLM budget). Held
    until the surrounding transaction commits/rolls back; never blocks *other* users.
    A no-op on non-Postgres backends (advisory locks are Postgres-only)."""
    if db.bind.dialect.name != "postgresql":
        return
    # crc32 spreads all 16 UUID bytes, then shift into the signed int4 range the
    # two-key form requires (a bijection, so it adds no cross-user collisions).
    user_key = zlib.crc32(user_id.bytes) - 2**31
    db.execute(
        select(func.pg_advisory_xact_lock(_ADVISORY_LOCK_NAMESPACE, user_key))
    )


def _existing(db: DBSession, journal_id: uuid.UUID) -> AIReflection | None:
    stmt = select(AIReflection).where(AIReflection.journal_id == journal_id)
    return db.execute(stmt).scalar_one_or_none()


def get_reflection(
    db: DBSession, user_id: uuid.UUID, journal_id: uuid.UUID
) -> AIReflection | None:
    """The reflection for one of the user's journal entries. None if the journal
    isn't theirs (indistinguishable from missing — no ID enumeration) or has no
    reflection yet."""
    if get_owned(db, Journal, user_id, journal_id) is None:
        return None
    return _existing(db, journal_id)


def create_or_get(
    db: DBSession, user_id: uuid.UUID, journal_id: uuid.UUID
) -> tuple[AIReflection, bool] | None:
    """Return (reflection, created) for one of the user's journal entries,
    generating it on first request. None if the journal isn't the caller's (or was
    deleted mid-request). Raises DailyLimitError (→ 429) when the per-day generation
    cap is hit, or GuestNotAllowedError (→ 403) for guest accounts."""
    journal = get_owned(db, Journal, user_id, journal_id)
    if journal is None:
        return None

    existing = _existing(db, journal_id)
    if existing is not None:
        return existing, False

    # Guests can READ an existing reflection but not GENERATE a new one: each
    # generation is a paid LLM call, and guest accounts are minted freely (a fresh
    # daily allowance every time), so unguarded generation is a cost loop.
    is_guest = db.execute(
        select(User.is_guest).where(User.id == user_id)
    ).scalar_one_or_none()
    if is_guest:
        raise GuestNotAllowedError()

    # Serialize this user's generations so the cap COUNT and the INSERT/commit below
    # are atomic per user. Held to commit/rollback (see _lock_user_generation).
    _lock_user_generation(db, user_id)
    # Re-check under the lock: a concurrent request may have generated meanwhile.
    existing = _existing(db, journal_id)
    if existing is not None:
        return existing, False

    # Only NEW generations count toward the cap (each one is an LLM call).
    enforce_daily_create_cap(db, AIReflection, user_id, limit=REFLECTION_DAILY_LIMIT)

    reflection_text, followup_question, model = reflection_coach.generate(
        journal.body, journal.mood, journal_id=journal_id
    )
    row = AIReflection(
        user_id=user_id,
        journal_id=journal_id,
        reflection_text=reflection_text,
        followup_question=followup_question,
        model=model,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = _existing(db, journal_id)
        if raced is not None:
            # A concurrent request won the unique(journal_id) race — theirs is the one.
            return raced, False
        # No racing reflection means the FK failed instead: the journal was deleted
        # between the ownership check and commit. Resolve to the same "not found"
        # contract as a missing journal (route maps None → 404) rather than a 500.
        return None
    db.refresh(row)
    return row, True

"""AI reflection business logic. One reflection per journal entry, generated once
and then reused; generation is capped per user per day (LLM cost control). All
queries scoped to the user — a journal that isn't the caller's behaves as missing."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.ai_reflection import AIReflection
from app.models.journal import Journal
from app.services._ownership import get_owned
from app.services.ai import reflection_coach

# Tighter than the general anti-spam ceiling: each NEW reflection is an LLM call, so
# generation is capped low (re-reading an existing reflection is never counted).
REFLECTION_DAILY_LIMIT = 10


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
    generating it on first request. None if the journal isn't the caller's.
    Raises DailyLimitError (→ 429) when the per-day generation cap is hit."""
    journal = get_owned(db, Journal, user_id, journal_id)
    if journal is None:
        return None

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
        # A concurrent request won the unique(journal_id) race — theirs is the one.
        db.rollback()
        raced = _existing(db, journal_id)
        if raced is not None:
            return raced, False
        raise
    db.refresh(row)
    return row, True

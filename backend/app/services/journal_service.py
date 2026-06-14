"""Meditation journal business logic and data access. All queries scoped to the
user (see docs/decisions/0006-layered-architecture.md)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import LinkedSessionNotFoundError
from app.core.limits import enforce_daily_create_cap
from app.models.journal import Journal
from app.models.session import Session as PracticeSession
from app.schemas.journal import JournalCreate, JournalUpdate

# 5 XP per journal reflection — parity with a gratitude moment (see dashboard_service).
JOURNAL_XP = 5


def _owns_session(db: DBSession, user_id: uuid.UUID, session_id: uuid.UUID) -> bool:
    stmt = select(PracticeSession.id).where(
        PracticeSession.id == session_id, PracticeSession.user_id == user_id
    )
    return db.execute(stmt).first() is not None


def create_entry(db: DBSession, user_id: uuid.UUID, data: JournalCreate) -> Journal:
    """Create a reflection. If a session is linked, it must be the caller's own."""
    enforce_daily_create_cap(db, Journal, user_id)
    if data.session_id is not None and not _owns_session(db, user_id, data.session_id):
        raise LinkedSessionNotFoundError()
    entry = Journal(user_id=user_id, **data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_entries(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    mood: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Journal]:
    stmt = select(Journal).where(Journal.user_id == user_id)
    if mood is not None:
        stmt = stmt.where(Journal.mood == mood)
    if q:
        # Case-insensitive substring match on the body. Escape LIKE wildcards so a
        # user's literal % or _ doesn't act as a pattern.
        term = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Journal.body.ilike(f"%{term}%", escape="\\"))
    stmt = stmt.order_by(Journal.created_at.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


def get_entry(db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> Journal | None:
    """Fetch one entry owned by the user. None if missing or not theirs."""
    stmt = select(Journal).where(Journal.id == entry_id, Journal.user_id == user_id)
    return db.execute(stmt).scalar_one_or_none()


def random_entry(db: DBSession, user_id: uuid.UUID) -> Journal | None:
    """A random reflection owned by the user — for the "resurface a memory" feature.
    None if the user has no entries."""
    stmt = (
        select(Journal)
        .where(Journal.user_id == user_id)
        .order_by(func.random())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def update_entry(
    db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID, data: JournalUpdate
) -> Journal | None:
    """Apply a partial edit. None if the entry isn't the caller's."""
    entry = get_entry(db, user_id, entry_id)
    if entry is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
    """Delete one entry owned by the user. Returns False if it wasn't found."""
    entry = get_entry(db, user_id, entry_id)
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True

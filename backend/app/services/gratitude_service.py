"""Gratitude business logic and data access. All queries scoped to the user
(see docs/decisions/0006-layered-architecture.md)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.gratitude import GratitudeEntry
from app.schemas.gratitude import GratitudeCreate
from app.services._ownership import delete_owned, get_owned

# 5 XP per gratitude moment (a meditation minute is 1 XP; see dashboard_service).
GRATITUDE_XP = 5


def create_entry(db: DBSession, user_id: uuid.UUID, data: GratitudeCreate) -> GratitudeEntry:
    enforce_daily_create_cap(db, GratitudeEntry, user_id)
    entry = GratitudeEntry(user_id=user_id, **data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_entries(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    category: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[GratitudeEntry]:
    stmt = select(GratitudeEntry).where(GratitudeEntry.user_id == user_id)
    if category is not None:
        stmt = stmt.where(GratitudeEntry.category == category)
    stmt = stmt.order_by(GratitudeEntry.created_at.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


def get_entry(
    db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID
) -> GratitudeEntry | None:
    """Fetch one entry owned by the user. None if missing or not theirs."""
    return get_owned(db, GratitudeEntry, user_id, entry_id)


def random_entry(db: DBSession, user_id: uuid.UUID) -> GratitudeEntry | None:
    """A random gratitude moment owned by the user — for "resurface a memory".
    None if the user has no entries."""
    # ORDER BY random() scans the user's rows, but the scan is bounded per user (and
    # row growth is capped by the daily-create limit), so it's cheap at our scale. A
    # count→random-OFFSET→fetch alternative skips the sort but adds a round-trip and a
    # race window (the count can shift between the two queries and return None when
    # entries exist), so it isn't worth the added complexity/risk here.
    stmt = (
        select(GratitudeEntry)
        .where(GratitudeEntry.user_id == user_id)
        .order_by(func.random())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def delete_entry(db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
    """Delete one entry owned by the user. Returns False if it wasn't found."""
    return delete_owned(db, GratitudeEntry, user_id, entry_id)

"""Gratitude business logic and data access. All queries scoped to the user
(see docs/decisions/0006-layered-architecture.md)."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.gratitude import GratitudeEntry
from app.schemas.gratitude import GratitudeCreate

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
    stmt = select(GratitudeEntry).where(
        GratitudeEntry.id == entry_id, GratitudeEntry.user_id == user_id
    )
    return db.execute(stmt).scalar_one_or_none()


def delete_entry(db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
    """Delete one entry owned by the user. Returns False if it wasn't found."""
    entry = get_entry(db, user_id, entry_id)
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True

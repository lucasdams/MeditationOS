"""Mood check-in business logic and data access. All queries scoped to the user
(see docs/decisions/0006-layered-architecture.md)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.mood_log import MoodLog
from app.schemas.mood_log import MoodLogCreate
from app.services._ownership import delete_owned, get_owned


def create_log(db: DBSession, user_id: uuid.UUID, data: MoodLogCreate) -> MoodLog:
    enforce_daily_create_cap(db, MoodLog, user_id)
    log = MoodLog(user_id=user_id, **data.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    days: int | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[MoodLog]:
    """Recent check-ins, newest first. `days` windows them for a trend view."""
    stmt = select(MoodLog).where(MoodLog.user_id == user_id)
    if days is not None:
        stmt = stmt.where(MoodLog.created_at >= datetime.now(UTC) - timedelta(days=days))
    stmt = stmt.order_by(MoodLog.created_at.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


def get_log(db: DBSession, user_id: uuid.UUID, log_id: uuid.UUID) -> MoodLog | None:
    """Fetch one check-in owned by the user. None if missing or not theirs."""
    return get_owned(db, MoodLog, user_id, log_id)


def delete_log(db: DBSession, user_id: uuid.UUID, log_id: uuid.UUID) -> bool:
    """Delete one check-in owned by the user. Returns False if it wasn't found."""
    return delete_owned(db, MoodLog, user_id, log_id)

"""Breathing pattern logic + data access. Global presets (`user_id IS NULL`) are
visible to everyone and read-only; users can create and delete their own.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.breathing_pattern import BreathingPattern
from app.schemas.breathing_pattern import BreathingPatternCreate


def list_patterns(db: DBSession, user_id: uuid.UUID) -> list[BreathingPattern]:
    """Global presets + the caller's own patterns."""
    stmt = (
        select(BreathingPattern)
        .where(or_(BreathingPattern.user_id.is_(None), BreathingPattern.user_id == user_id))
        .order_by(BreathingPattern.is_preset.desc(), BreathingPattern.created_at)
    )
    return list(db.execute(stmt).scalars().all())


def create_pattern(
    db: DBSession, user_id: uuid.UUID, data: BreathingPatternCreate
) -> BreathingPattern:
    # Per-user, per-day creation cap (anti-spam) — mirrors sessions/gratitude/journals/goals.
    enforce_daily_create_cap(db, BreathingPattern, user_id)
    pattern = BreathingPattern(
        user_id=user_id,
        name=data.name,
        inhale_seconds=data.inhale_seconds,
        exhale_seconds=data.exhale_seconds,
        is_preset=False,
    )
    db.add(pattern)
    db.commit()
    db.refresh(pattern)
    return pattern


def delete_pattern(db: DBSession, user_id: uuid.UUID, pattern_id: uuid.UUID) -> bool:
    """Delete one of the caller's own patterns. Presets (user_id NULL) and other
    users' patterns never match, so they return False → 404."""
    stmt = select(BreathingPattern).where(
        BreathingPattern.id == pattern_id, BreathingPattern.user_id == user_id
    )
    pattern = db.execute(stmt).scalar_one_or_none()
    if pattern is None:
        return False
    db.delete(pattern)
    db.commit()
    return True

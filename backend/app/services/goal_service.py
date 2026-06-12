"""Goal business logic. Goals store only intent (type + target + status);
**progress is computed on read** from the same activity the dashboard aggregates
(ADR-0009). All queries scoped to the user.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.goal import Goal
from app.schemas.dashboard import DashboardStats
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate
from app.services import dashboard_service


def _raw_and_threshold(goal: Goal, stats: DashboardStats) -> tuple[int, int, int]:
    """Return (raw_value, unit_for_current, threshold) in comparable units.

    raw_value and threshold are compared directly for achievement; `current` is
    raw_value // unit, expressed in the goal's display unit (min / days / hours).
    """
    if goal.type == "daily_minutes":
        today_seconds = stats.this_week[-1].seconds if stats.this_week else 0
        return today_seconds, 60, goal.target * 60  # seconds
    if goal.type == "streak_days":
        return stats.current_streak_days, 1, goal.target  # days
    # total_hours
    return int(stats.total_seconds), 3600, goal.target * 3600  # seconds


def _to_read(goal: Goal, stats: DashboardStats) -> GoalRead:
    raw, unit, threshold = _raw_and_threshold(goal, stats)
    ratio = raw / threshold if threshold > 0 else 0.0
    return GoalRead(
        id=goal.id,
        type=goal.type,
        target=goal.target,
        status=goal.status,
        current=raw // unit,
        progress=round(min(1.0, ratio), 4),
        achieved=ratio >= 1.0,
        created_at=goal.created_at,
    )


def _get(db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal | None:
    return db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
    ).scalar_one_or_none()


def create_goal(
    db: DBSession, user_id: uuid.UUID, data: GoalCreate, *, today: date, tz: str
) -> GoalRead:
    goal = Goal(user_id=user_id, type=data.type, target=data.target)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    stats = dashboard_service.get_stats(db, user_id, today=today, tz=tz)
    return _to_read(goal, stats)


def list_goals(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    today: date,
    tz: str,
    status: str | None = None,
) -> list[GoalRead]:
    stmt = select(Goal).where(Goal.user_id == user_id)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    goals = list(db.execute(stmt.order_by(Goal.created_at.desc())).scalars().all())
    if not goals:
        return []
    stats = dashboard_service.get_stats(db, user_id, today=today, tz=tz)
    return [_to_read(g, stats) for g in goals]


def get_goal(
    db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID, *, today: date, tz: str
) -> GoalRead | None:
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return None
    stats = dashboard_service.get_stats(db, user_id, today=today, tz=tz)
    return _to_read(goal, stats)


def update_goal(
    db: DBSession,
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    data: GoalUpdate,
    *,
    today: date,
    tz: str,
) -> GoalRead | None:
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    stats = dashboard_service.get_stats(db, user_id, today=today, tz=tz)
    return _to_read(goal, stats)


def delete_goal(db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> bool:
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return False
    db.delete(goal)
    db.commit()
    return True

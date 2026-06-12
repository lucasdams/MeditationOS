"""Goal business logic. Goals store only intent (activity + cadence + status);
**progress in the current period is computed on read** from the same activity the
rest of the app records (ADR-0009). All queries scoped to the user.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.goal import Goal
from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import Session as PracticeSession
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate


def _period_start(period: str, today: date) -> date:
    """First local day of the current period — today for daily, a rolling 7-day
    window (today and the previous 6) for weekly."""
    return today - timedelta(days=6) if period == "week" else today


def _local_date(tz: str, column):
    return func.date(func.timezone(tz, column))


def _done_count(db: DBSession, user_id: uuid.UUID, goal: Goal, *, today: date, tz: str) -> int:
    """How many times the goal's activity happened in the current period."""
    start = _period_start(goal.period, today)

    if goal.activity in ("meditate", "breathe"):
        local = _local_date(tz, PracticeSession.occurred_at)
        stmt = (
            select(func.count())
            .select_from(PracticeSession)
            .where(PracticeSession.user_id == user_id, local >= start, local <= today)
        )
        if goal.activity == "breathe":
            stmt = stmt.where(PracticeSession.type == "resonance_breathing")
    elif goal.activity == "gratitude":
        local = _local_date(tz, GratitudeEntry.created_at)
        stmt = (
            select(func.count())
            .select_from(GratitudeEntry)
            .where(GratitudeEntry.user_id == user_id, local >= start, local <= today)
        )
    else:  # journal
        local = _local_date(tz, Journal.created_at)
        stmt = (
            select(func.count())
            .select_from(Journal)
            .where(Journal.user_id == user_id, local >= start, local <= today)
        )
    return db.execute(stmt).scalar_one()


def _to_read(db: DBSession, user_id: uuid.UUID, goal: Goal, *, today: date, tz: str) -> GoalRead:
    done = _done_count(db, user_id, goal, today=today, tz=tz)
    ratio = done / goal.count if goal.count > 0 else 0.0
    return GoalRead(
        id=goal.id,
        activity=goal.activity,
        period=goal.period,
        count=goal.count,
        status=goal.status,
        done=done,
        progress=round(min(1.0, ratio), 4),
        achieved=done >= goal.count,
        created_at=goal.created_at,
    )


def _get(db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal | None:
    return db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
    ).scalar_one_or_none()


def create_goal(
    db: DBSession, user_id: uuid.UUID, data: GoalCreate, *, today: date, tz: str
) -> GoalRead:
    enforce_daily_create_cap(db, Goal, user_id)
    goal = Goal(user_id=user_id, activity=data.activity, period=data.period, count=data.count)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _to_read(db, user_id, goal, today=today, tz=tz)


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
    return [_to_read(db, user_id, g, today=today, tz=tz) for g in goals]


def get_goal(
    db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID, *, today: date, tz: str
) -> GoalRead | None:
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return None
    return _to_read(db, user_id, goal, today=today, tz=tz)


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
    return _to_read(db, user_id, goal, today=today, tz=tz)


def delete_goal(db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> bool:
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return False
    db.delete(goal)
    db.commit()
    return True

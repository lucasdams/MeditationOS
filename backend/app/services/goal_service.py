"""Goal business logic. Goals store only intent (activity + cadence + status);
**progress in the current period is computed on read** from the same activity the
rest of the app records (ADR-0009). All queries scoped to the user.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import GoalNotCheckableError
from app.core.limits import enforce_daily_create_cap
from app.models.goal import Goal, GoalCheckin
from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import BREATHING_SESSION_TYPES
from app.models.session import Session as PracticeSession
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate
from app.services._ownership import delete_owned, get_owned
from app.services.time_utils import local_date


def _period_start(period: str, today: date) -> date:
    """First local day of the current period — today for daily, a rolling 7-day
    window (today and the previous 6) for weekly, and all-time for total."""
    if period == "total":
        return date.min  # count everything up to today
    if period == "week":
        return today - timedelta(days=6)
    return today


def _done_count(db: DBSession, user_id: uuid.UUID, goal: Goal, *, today: date, tz: str) -> int:
    """How many times the goal's activity happened in the current period.

    Built-in activities are counted from the rows the app already records; a custom
    goal counts its manual check-ins (distinct days, via the per-day unique)."""
    start = _period_start(goal.period, today)

    if goal.activity == "custom":
        stmt = (
            select(func.count())
            .select_from(GoalCheckin)
            .where(
                GoalCheckin.goal_id == goal.id,
                GoalCheckin.checkin_date >= start,
                GoalCheckin.checkin_date <= today,
            )
        )
        return db.execute(stmt).scalar_one()

    if goal.activity in ("meditate", "breathe"):
        local = local_date(tz, PracticeSession.occurred_at)
        stmt = (
            select(func.count())
            .select_from(PracticeSession)
            .where(PracticeSession.user_id == user_id, local >= start, local <= today)
        )
        if goal.activity == "breathe":
            stmt = stmt.where(PracticeSession.type.in_(BREATHING_SESSION_TYPES))
    elif goal.activity == "gratitude":
        local = local_date(tz, GratitudeEntry.created_at)
        stmt = (
            select(func.count())
            .select_from(GratitudeEntry)
            .where(GratitudeEntry.user_id == user_id, local >= start, local <= today)
        )
    else:  # journal
        local = local_date(tz, Journal.created_at)
        stmt = (
            select(func.count())
            .select_from(Journal)
            .where(Journal.user_id == user_id, local >= start, local <= today)
        )
    return db.execute(stmt).scalar_one()


def _checked_in_today(db: DBSession, goal: Goal, *, today: date) -> bool:
    """Whether a custom goal already has a check-in for the user's local today."""
    if goal.activity != "custom":
        return False
    stmt = select(GoalCheckin.id).where(
        GoalCheckin.goal_id == goal.id, GoalCheckin.checkin_date == today
    )
    return db.execute(stmt).first() is not None


def _to_read(db: DBSession, user_id: uuid.UUID, goal: Goal, *, today: date, tz: str) -> GoalRead:
    done = _done_count(db, user_id, goal, today=today, tz=tz)
    ratio = done / goal.count if goal.count > 0 else 0.0
    return GoalRead(
        id=goal.id,
        activity=goal.activity,
        label=goal.label,
        period=goal.period,
        count=goal.count,
        status=goal.status,
        done=done,
        progress=round(min(1.0, ratio), 4),
        achieved=done >= goal.count,
        checked_in_today=_checked_in_today(db, goal, today=today),
        created_at=goal.created_at,
    )


def _get(db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal | None:
    return get_owned(db, Goal, user_id, goal_id)


def create_goal(
    db: DBSession, user_id: uuid.UUID, data: GoalCreate, *, today: date, tz: str
) -> GoalRead:
    enforce_daily_create_cap(db, Goal, user_id)
    goal = Goal(
        user_id=user_id,
        activity=data.activity,
        label=data.label,
        period=data.period,
        count=data.count,
    )
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
    return delete_owned(db, Goal, user_id, goal_id)


def add_checkin(
    db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID, *, today: date, tz: str
) -> GoalRead | None:
    """Mark a custom goal done for the user's local today (idempotent). Returns the
    updated goal, None if it doesn't exist/isn't owned, raises if it isn't custom."""
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return None
    if goal.activity != "custom":
        raise GoalNotCheckableError
    # No daily-create cap here: a check-in is a habit mark, naturally bounded to one
    # per goal per day by uq_goal_checkin_day (and goal creation is already capped),
    # so toggling done/undo can't be used to spam or to lock yourself out.
    if not _checked_in_today(db, goal, today=today):
        db.add(GoalCheckin(goal_id=goal.id, user_id=user_id, checkin_date=today))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # a concurrent request already checked in today — idempotent
    return _to_read(db, user_id, goal, today=today, tz=tz)


def remove_checkin(
    db: DBSession, user_id: uuid.UUID, goal_id: uuid.UUID, *, today: date, tz: str
) -> GoalRead | None:
    """Undo today's check-in for a custom goal (idempotent). Returns the updated
    goal, None if it doesn't exist/isn't owned, raises if it isn't custom."""
    goal = _get(db, user_id, goal_id)
    if goal is None:
        return None
    if goal.activity != "custom":
        raise GoalNotCheckableError
    db.execute(
        delete(GoalCheckin).where(
            GoalCheckin.goal_id == goal.id, GoalCheckin.checkin_date == today
        )
    )
    db.commit()
    return _to_read(db, user_id, goal, today=today, tz=tz)

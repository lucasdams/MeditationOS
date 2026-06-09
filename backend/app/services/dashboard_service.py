"""Dashboard aggregates, computed from `sessions` by SQL (not Python loops).

Streak fields are added in a follow-up ticket. The calendar date is the date of
`occurred_at` in UTC for V1 (per-user timezone is a known later improvement).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.session import Session
from app.schemas.dashboard import DailyTotal, DashboardStats


def get_stats(db: DBSession, user_id: uuid.UUID, *, today: date) -> DashboardStats:
    total_seconds, session_count = db.execute(
        select(
            func.coalesce(func.sum(Session.duration_seconds), 0),
            func.count(Session.id),
        ).where(Session.user_id == user_id)
    ).one()

    # Last 7 calendar days, zero-filled, oldest → today.
    week_start = today - timedelta(days=6)
    rows = db.execute(
        select(
            func.date(Session.occurred_at),
            func.coalesce(func.sum(Session.duration_seconds), 0),
        )
        .where(
            Session.user_id == user_id,
            func.date(Session.occurred_at) >= week_start,
            func.date(Session.occurred_at) <= today,
        )
        .group_by(func.date(Session.occurred_at))
    ).all()
    by_date = {row[0]: int(row[1]) for row in rows}

    this_week = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        this_week.append(DailyTotal(date=day, seconds=by_date.get(day, 0)))

    return DashboardStats(
        total_seconds=int(total_seconds),
        session_count=int(session_count),
        this_week=this_week,
    )

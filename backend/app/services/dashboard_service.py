"""Dashboard aggregates, computed from `sessions` by SQL (not Python loops).

Streaks are computed from the distinct calendar dates of `occurred_at` (UTC for
V1 — per-user timezone is a known later improvement), not stored.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.session import Session
from app.schemas.dashboard import ActivityCalendar, DailyTotal, DashboardStats


def _compute_streaks(dates: set[date], today: date) -> tuple[int, int]:
    """Return (current_streak_days, longest_streak_days) from days-with-a-session.

    - longest: the longest run of consecutive days, ever.
    - current: the run ending today OR yesterday (grace through end of today);
      0 if neither has a session.
    """
    if not dates:
        return 0, 0

    ordered = sorted(dates)
    longest = run = 1
    for prev, cur in zip(ordered, ordered[1:], strict=False):
        run = run + 1 if (cur - prev).days == 1 else 1
        longest = max(longest, run)

    current = 0
    anchor = today if today in dates else today - timedelta(days=1)
    if anchor in dates:
        day = anchor
        while day in dates:
            current += 1
            day -= timedelta(days=1)

    return current, longest


def _level_progress(xp: int) -> tuple[int, int, int]:
    """Pokémon-style rising curve. XP = minutes practiced.

    Cumulative XP to *reach* level L is 10·L·(L−1) (so each level needs 20·level
    more than the last — quick early levels, slower later). Returns
    (level, xp_into_level, xp_for_next_level).
    """
    level = 1
    while 10 * (level + 1) * level <= xp:  # cumulative XP needed for level+1
        level += 1
    xp_into_level = xp - 10 * level * (level - 1)
    xp_for_next_level = 20 * level
    return level, xp_into_level, xp_for_next_level


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

    # All distinct practice days (for streaks).
    day_rows = db.execute(
        select(func.date(Session.occurred_at)).where(Session.user_id == user_id).distinct()
    ).all()
    current_streak, longest_streak = _compute_streaks({row[0] for row in day_rows}, today)

    xp = int(total_seconds) // 60  # 1 XP per minute practiced
    level, xp_into_level, xp_for_next_level = _level_progress(xp)

    return DashboardStats(
        total_seconds=int(total_seconds),
        session_count=int(session_count),
        current_streak_days=current_streak,
        longest_streak_days=longest_streak,
        xp=xp,
        level=level,
        xp_into_level=xp_into_level,
        xp_for_next_level=xp_for_next_level,
        this_week=this_week,
    )


def get_activity(
    db: DBSession, user_id: uuid.UUID, *, today: date, days: int = 365
) -> ActivityCalendar:
    """Daily practice totals over the last `days`, sparse (active days only)."""
    start = today - timedelta(days=days - 1)
    rows = db.execute(
        select(
            func.date(Session.occurred_at),
            func.coalesce(func.sum(Session.duration_seconds), 0),
        )
        .where(
            Session.user_id == user_id,
            func.date(Session.occurred_at) >= start,
            func.date(Session.occurred_at) <= today,
        )
        .group_by(func.date(Session.occurred_at))
        .order_by(func.date(Session.occurred_at))
    ).all()
    active_days = [DailyTotal(date=row[0], seconds=int(row[1])) for row in rows]
    return ActivityCalendar(start=start, end=today, days=active_days)

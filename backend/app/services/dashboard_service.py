"""Dashboard aggregates, computed from `sessions` by SQL (not Python loops).

Streaks, daily quests, the heatmap, and the weekly view are computed from the
distinct calendar dates of `occurred_at` in the **user's timezone** (Postgres
`timezone(tz, ...)`), so the day rolls over at the user's local midnight. Not stored.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.gratitude import GratitudeEntry
from app.models.session import Session
from app.schemas.dashboard import ActivityCalendar, DailyTotal, DashboardStats, QuestStatus
from app.services.gratitude_service import GRATITUDE_XP

# Resonance breathing earns this multiple of the usual 1 XP/minute.
BREATHING_XP_MULTIPLIER = 3
# Each daily quest, completed on a given day, is worth this much (counts once per day).
QUEST_XP = 15
# Bonus XP per day of your current streak (grows as you keep it up, falls if it lapses).
STREAK_BONUS_PER_DAY = 10
# A day with at least this much resonance breathing completes the breathing quest.
BREATHE_QUEST_SECONDS = 60


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


def _local_date(tz: str, column):
    """The calendar date of a timestamptz column in the given IANA timezone."""
    return func.date(func.timezone(tz, column))


def get_stats(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC"
) -> DashboardStats:
    total_seconds, session_count = db.execute(
        select(
            func.coalesce(func.sum(Session.duration_seconds), 0),
            func.count(Session.id),
        ).where(Session.user_id == user_id)
    ).one()

    # Resonance breathing earns extra XP (it's the harder, signature practice).
    breathing_seconds = db.execute(
        select(func.coalesce(func.sum(Session.duration_seconds), 0)).where(
            Session.user_id == user_id,
            Session.type == "resonance_breathing",
        )
    ).scalar_one()

    # Last 7 calendar days, zero-filled, oldest → today.
    week_start = today - timedelta(days=6)
    local_day = _local_date(tz, Session.occurred_at)
    rows = db.execute(
        select(
            local_day,
            func.coalesce(func.sum(Session.duration_seconds), 0),
        )
        .where(
            Session.user_id == user_id,
            local_day >= week_start,
            local_day <= today,
        )
        .group_by(local_day)
    ).all()
    by_date = {row[0]: int(row[1]) for row in rows}

    this_week = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        this_week.append(DailyTotal(date=day, seconds=by_date.get(day, 0)))

    # All distinct practice days (for streaks + the "log a session" quest).
    day_rows = db.execute(
        select(_local_date(tz, Session.occurred_at))
        .where(Session.user_id == user_id)
        .distinct()
    ).all()
    session_days = {row[0] for row in day_rows}
    current_streak, longest_streak = _compute_streaks(session_days, today)

    # Days with a gratitude entry (the "write a gratitude" quest).
    grat_day_rows = db.execute(
        select(_local_date(tz, GratitudeEntry.created_at))
        .where(GratitudeEntry.user_id == user_id)
        .distinct()
    ).all()
    gratitude_days = {row[0] for row in grat_day_rows}
    gratitude_count = int(
        db.execute(
            select(func.count(GratitudeEntry.id)).where(GratitudeEntry.user_id == user_id)
        ).scalar_one()
    )

    # Days with at least a minute of resonance breathing (the "breathe" quest).
    breathing_local_day = _local_date(tz, Session.occurred_at)
    breathing_day_rows = db.execute(
        select(breathing_local_day)
        .where(Session.user_id == user_id, Session.type == "resonance_breathing")
        .group_by(breathing_local_day)
        .having(func.sum(Session.duration_seconds) >= BREATHE_QUEST_SECONDS)
    ).all()
    breathing_days = {row[0] for row in breathing_day_rows}

    # Daily quests reset each day; total XP counts every day they were ever completed,
    # so that part only ever grows. The streak bonus rides the *current* streak, so it
    # grows as you keep it up and falls back if the streak lapses.
    quest_bonus_xp = (len(gratitude_days) + len(session_days) + len(breathing_days)) * QUEST_XP
    streak_bonus_xp = current_streak * STREAK_BONUS_PER_DAY

    # 1 XP per minute practiced, but resonance breathing counts 3×; plus
    # GRATITUDE_XP per gratitude moment, daily-quest bonuses, and the streak bonus.
    non_breathing_seconds = int(total_seconds) - int(breathing_seconds)
    xp = (
        non_breathing_seconds // 60
        + int(breathing_seconds) // 60 * BREATHING_XP_MULTIPLIER
        + gratitude_count * GRATITUDE_XP
        + quest_bonus_xp
        + streak_bonus_xp
    )
    level, xp_into_level, xp_for_next_level = _level_progress(xp)

    daily_quests = [
        QuestStatus(
            key="gratitude",
            label="Write a gratitude",
            xp=QUEST_XP,
            done=today in gratitude_days,
        ),
        QuestStatus(
            key="breathe",
            label="Breathe for a minute",
            xp=QUEST_XP,
            done=today in breathing_days,
        ),
        QuestStatus(
            key="session",
            label="Log a session",
            xp=QUEST_XP,
            done=today in session_days,
        ),
    ]

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
        gratitude_count=gratitude_count,
        streak_bonus_xp=streak_bonus_xp,
        daily_quests=daily_quests,
    )


def get_activity(
    db: DBSession, user_id: uuid.UUID, *, today: date, days: int = 365, tz: str = "UTC"
) -> ActivityCalendar:
    """Daily practice totals over the last `days`, sparse (active days only)."""
    start = today - timedelta(days=days - 1)
    local_day = _local_date(tz, Session.occurred_at)
    rows = db.execute(
        select(
            local_day,
            func.coalesce(func.sum(Session.duration_seconds), 0),
        )
        .where(
            Session.user_id == user_id,
            local_day >= start,
            local_day <= today,
        )
        .group_by(local_day)
        .order_by(local_day)
    ).all()
    active_days = [DailyTotal(date=row[0], seconds=int(row[1])) for row in rows]
    return ActivityCalendar(start=start, end=today, days=active_days)

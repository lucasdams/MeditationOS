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
from app.models.journal import Journal
from app.models.session import Session
from app.models.user import QUEST_FEATURES
from app.schemas.dashboard import (
    ActivityCalendar,
    ActivityDay,
    DailyTotal,
    DashboardStats,
    QuestStatus,
)
from app.services.gratitude_service import GRATITUDE_XP
from app.services.journal_service import JOURNAL_XP
from app.services.quest_pool import quest_for

# XP per minute of meditation (non-breathing). Breathing — the harder, signature
# practice — earns BREATHING_XP_MULTIPLIER× this.
MEDITATION_XP_PER_MIN = 2
BREATHING_XP_MULTIPLIER = 3
# Bonus XP per day of your current streak (grows as you keep it up, falls if it lapses).
STREAK_BONUS_PER_DAY = 10
# A day with at least this much resonance breathing completes the base breathing quest;
# the "deep breathe" challenge variant asks for DEEP_BREATHE_SECONDS.
BREATHE_QUEST_SECONDS = 60
DEEP_BREATHE_SECONDS = 300
# The "sit 10+ minutes" challenge: a single meditation session of at least this long.
LONG_SIT_SECONDS = 600
# The "slow breathe" challenge: a breathing session paced at ≤5 bpm, i.e. one full
# breath (inhale + exhale) lasting at least this many seconds.
SLOW_BREATH_SECONDS = 12


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
    db: DBSession,
    user_id: uuid.UUID,
    *,
    today: date,
    tz: str = "UTC",
    quest_features: list[str] | None = None,
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

    # Days with a meditation (non-breathing) session — the "meditate" quest. Distinct
    # from "breathe" so a user can opt into either or both.
    meditation_day_rows = db.execute(
        select(_local_date(tz, Session.occurred_at))
        .where(Session.user_id == user_id, Session.type != "resonance_breathing")
        .distinct()
    ).all()
    meditation_days = {row[0] for row in meditation_day_rows}

    # Days with a journal entry — the "journal" quest.
    journal_day_rows = db.execute(
        select(_local_date(tz, Journal.created_at))
        .where(Journal.user_id == user_id)
        .distinct()
    ).all()
    journal_days = {row[0] for row in journal_day_rows}
    journal_count = int(
        db.execute(
            select(func.count(Journal.id)).where(Journal.user_id == user_id)
        ).scalar_one()
    )

    # --- Per-day conditions for the rotating quest *challenge* variants ---------
    # Each set holds the local days on which a given variant was satisfied; the keys
    # match Quest.cond in app/services/quest_pool.py. The four base conditions
    # (meditate/breathe/gratitude/journal) reuse the sets computed above.

    # "Sit 10+ minutes": a single non-breathing session ≥ LONG_SIT_SECONDS.
    long_sit_days = {
        r[0]
        for r in db.execute(
            select(_local_date(tz, Session.occurred_at))
            .where(
                Session.user_id == user_id,
                Session.type != "resonance_breathing",
                Session.duration_seconds >= LONG_SIT_SECONDS,
            )
            .distinct()
        ).all()
    }
    # "Meditate twice today": ≥2 non-breathing sessions on the day.
    double_sit_local_day = _local_date(tz, Session.occurred_at)
    double_sit_days = {
        r[0]
        for r in db.execute(
            select(double_sit_local_day)
            .where(Session.user_id == user_id, Session.type != "resonance_breathing")
            .group_by(double_sit_local_day)
            .having(func.count(Session.id) >= 2)
        ).all()
    }
    # "Breathe 5+ minutes": total resonance breathing ≥ DEEP_BREATHE_SECONDS.
    deep_breathe_days = {
        r[0]
        for r in db.execute(
            select(breathing_local_day)
            .where(Session.user_id == user_id, Session.type == "resonance_breathing")
            .group_by(breathing_local_day)
            .having(func.sum(Session.duration_seconds) >= DEEP_BREATHE_SECONDS)
        ).all()
    }
    # "Breathe slow (≤5 bpm)": a breathing session with inhale+exhale ≥ SLOW_BREATH_SECONDS.
    slow_breathe_days = {
        r[0]
        for r in db.execute(
            select(_local_date(tz, Session.occurred_at))
            .where(
                Session.user_id == user_id,
                Session.type == "resonance_breathing",
                Session.inhale_seconds.isnot(None),
                Session.exhale_seconds.isnot(None),
                (Session.inhale_seconds + Session.exhale_seconds) >= SLOW_BREATH_SECONDS,
            )
            .distinct()
        ).all()
    }
    # "Write three gratitudes": ≥3 gratitude entries on the day.
    grat_three_local_day = _local_date(tz, GratitudeEntry.created_at)
    gratitude_three_days = {
        r[0]
        for r in db.execute(
            select(grat_three_local_day)
            .where(GratitudeEntry.user_id == user_id)
            .group_by(grat_three_local_day)
            .having(func.count(GratitudeEntry.id) >= 3)
        ).all()
    }
    # "Journal with a mood": a journal entry carrying a mood tag.
    mood_journal_days = {
        r[0]
        for r in db.execute(
            select(_local_date(tz, Journal.created_at))
            .where(Journal.user_id == user_id, Journal.mood.isnot(None))
            .distinct()
        ).all()
    }

    cond_days = {
        "meditate": meditation_days,
        "long_sit": long_sit_days,
        "double_sit": double_sit_days,
        "breathe": breathing_days,
        "deep_breathe": deep_breathe_days,
        "slow_breathe": slow_breathe_days,
        "gratitude": gratitude_days,
        "gratitude_three": gratitude_three_days,
        "journal": journal_days,
        "mood_journal": mood_journal_days,
    }

    # Daily quests reset each day; total quest XP counts every day a quest was ever
    # completed, so that part only ever grows (each past day's quest is fixed by its
    # date). The streak bonus rides the *current* streak, so it grows as you keep it up
    # and falls back if the streak lapses.
    #
    # The quest the user faces in each category rotates by date (quest_pool.quest_for),
    # and each variant pays its own XP. Earning is independent of which quests the user
    # surfaced — doing the day's activity for any of the four categories earns that
    # day's variant's XP. We sum over every day with any activity.
    all_active_days = session_days | gratitude_days | journal_days
    quest_bonus_xp = 0
    for day in all_active_days:
        for category in QUEST_FEATURES:
            quest = quest_for(category, day)
            if day in cond_days[quest.cond]:
                quest_bonus_xp += quest.xp
    streak_bonus_xp = current_streak * STREAK_BONUS_PER_DAY

    # MEDITATION_XP_PER_MIN per minute of meditation; resonance breathing counts
    # BREATHING_XP_MULTIPLIER×; plus GRATITUDE_XP/JOURNAL_XP per reflection, the
    # daily-quest bonus, and the streak bonus.
    non_breathing_seconds = int(total_seconds) - int(breathing_seconds)
    xp = (
        non_breathing_seconds // 60 * MEDITATION_XP_PER_MIN
        + int(breathing_seconds) // 60 * BREATHING_XP_MULTIPLIER
        + gratitude_count * GRATITUDE_XP
        + journal_count * JOURNAL_XP
        + quest_bonus_xp
        + streak_bonus_xp
    )
    level, xp_into_level, xp_for_next_level = _level_progress(xp)

    # Today's quest list is personalized: the user opts into a subset of
    # QUEST_FEATURES (≥3); NULL (not chosen yet) falls back to all four. Within each
    # chosen category, today's rotating variant is surfaced with its own label + XP.
    selected = set(quest_features) if quest_features else set(QUEST_FEATURES)
    daily_quests = []
    for key in QUEST_FEATURES:  # canonical order
        if key not in selected:
            continue
        quest = quest_for(key, today)
        daily_quests.append(
            QuestStatus(
                key=quest.key,
                variant=quest.variant,
                label=quest.label,
                xp=quest.xp,
                done=today in cond_days[quest.cond],
            )
        )

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
    """Daily practice totals over the last `days`, sparse (active days only).

    Each active day also carries `all_quests` — whether all three daily quests
    (gratitude, ≥60s breathing, a session) were completed that local day — so the
    heatmap can colour days as inactive / active / all-quests-complete.
    """
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

    # Days (in-window) with a gratitude entry, and with ≥60s of resonance breathing.
    # A session is implied for every active day, so all_quests = gratitude ∧ breathing.
    grat_day = _local_date(tz, GratitudeEntry.created_at)
    gratitude_days = {
        r[0]
        for r in db.execute(
            select(grat_day)
            .where(GratitudeEntry.user_id == user_id, grat_day >= start, grat_day <= today)
            .distinct()
        ).all()
    }
    breathing_days = {
        r[0]
        for r in db.execute(
            select(local_day)
            .where(
                Session.user_id == user_id,
                Session.type == "resonance_breathing",
                local_day >= start,
                local_day <= today,
            )
            .group_by(local_day)
            .having(func.sum(Session.duration_seconds) >= BREATHE_QUEST_SECONDS)
        ).all()
    }

    active_days = [
        ActivityDay(
            date=row[0],
            seconds=int(row[1]),
            all_quests=row[0] in gratitude_days and row[0] in breathing_days,
        )
        for row in rows
    ]
    return ActivityCalendar(start=start, end=today, days=active_days)

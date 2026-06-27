"""Analytics aggregates, computed from the user's data by SQL (not Python loops).

Everything is bucketed in the user's timezone (Postgres `timezone(tz, ...)`), like the
dashboard. Scoped to the user. Read-only — nothing is stored.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import Float, cast, func, select
from sqlalchemy.orm import Session as DBSession

from app.models.journal import Journal
from app.models.mood_log import MoodLog
from app.models.session import Session
from app.schemas.analytics import (
    AnalyticsSummary,
    MonthComparison,
    MonthTotals,
    MoodCount,
    TimeBucketCount,
    TypeBreakdown,
    WeekdayCount,
    WeekMinutes,
    WeekMoods,
    WeekRatings,
)
from app.services.time_utils import local_date

_BUCKETS = ("morning", "afternoon", "evening", "night")


def _bucket_for_hour(hour: int) -> str:
    if 5 <= hour <= 11:
        return "morning"
    if 12 <= hour <= 16:
        return "afternoon"
    if 17 <= hour <= 21:
        return "evening"
    return "night"  # 22–23, 0–4


def get_analytics(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str, weeks: int = 12
) -> AnalyticsSummary:
    local_ts = func.timezone(tz, Session.occurred_at)
    local_day = local_date(tz, Session.occurred_at)
    owned = Session.user_id == user_id

    # Totals.
    total_seconds, total_sessions = db.execute(
        select(func.coalesce(func.sum(Session.duration_seconds), 0), func.count()).where(owned)
    ).one()
    days_practiced = db.execute(
        select(func.count(func.distinct(local_day))).where(owned)
    ).scalar_one()

    # By meditation type.
    by_type = [
        TypeBreakdown(type=t, count=c, minutes=int(secs) // 60)
        for t, c, secs in db.execute(
            select(
                Session.type,
                func.count(),
                func.coalesce(func.sum(Session.duration_seconds), 0),
            )
            .where(owned)
            .group_by(Session.type)
            .order_by(func.sum(Session.duration_seconds).desc())
        )
    ]

    # By day of week (0 = Sunday … 6 = Saturday), zero-filled.
    dow = func.extract("dow", local_ts)
    dow_counts = {
        int(d): c
        for d, c in db.execute(select(dow, func.count()).where(owned).group_by(dow))
    }
    by_weekday = [WeekdayCount(weekday=d, count=dow_counts.get(d, 0)) for d in range(7)]

    # By time of day (bucket the local hour), ordered.
    hour = func.extract("hour", local_ts)
    bucket_totals = dict.fromkeys(_BUCKETS, 0)
    for h, c in db.execute(select(hour, func.count()).where(owned).group_by(hour)):
        bucket_totals[_bucket_for_hour(int(h))] += c
    by_time_of_day = [TimeBucketCount(bucket=b, count=bucket_totals[b]) for b in _BUCKETS]

    # Minutes per week over the last `weeks` weeks (Monday-aligned), zero-filled.
    monday = today - timedelta(days=today.weekday())  # Monday of this week
    week_starts = [monday - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    week_col = func.date(func.date_trunc("week", local_ts))
    week_minutes = {
        w: int(secs) // 60
        for w, secs in db.execute(
            select(week_col, func.coalesce(func.sum(Session.duration_seconds), 0))
            .where(owned, local_day >= week_starts[0])
            .group_by(week_col)
        )
    }
    minutes_by_week = [
        WeekMinutes(week_start=w, minutes=week_minutes.get(w, 0)) for w in week_starts
    ]

    # Mood distribution — combine standalone check-ins (MoodLog) and journal-tagged
    # moods, exactly as the weekly review does, so the "feeds your trends" promise on
    # the one-tap check-in holds. Both reuse the same canonical mood palette.
    mood_totals: dict[str, int] = {}
    for mood, c in db.execute(
        select(MoodLog.mood, func.count())
        .where(MoodLog.user_id == user_id)
        .group_by(MoodLog.mood)
    ):
        mood_totals[mood] = mood_totals.get(mood, 0) + c
    for mood, c in db.execute(
        select(Journal.mood, func.count())
        .where(Journal.user_id == user_id, Journal.mood.is_not(None))
        .group_by(Journal.mood)
    ):
        mood_totals[mood] = mood_totals.get(mood, 0) + c
    # Most common first; alphabetical tie-break for a stable, deterministic order.
    moods = [
        MoodCount(mood=m, count=c)
        for m, c in sorted(mood_totals.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    # Mood over time — per-week counts merging check-ins and journal moods, over the
    # same weeks window, bucketed in the user's local week like everything else.
    week_mood_counts: dict[date, dict[str, int]] = {}
    ml_week = func.date(func.date_trunc("week", func.timezone(tz, MoodLog.created_at)))
    ml_day = local_date(tz, MoodLog.created_at)
    for w, m, c in db.execute(
        select(ml_week, MoodLog.mood, func.count())
        .where(MoodLog.user_id == user_id, ml_day >= week_starts[0])
        .group_by(ml_week, MoodLog.mood)
    ):
        bucket = week_mood_counts.setdefault(w, {})
        bucket[m] = bucket.get(m, 0) + c
    j_week = func.date(func.date_trunc("week", func.timezone(tz, Journal.created_at)))
    j_day = local_date(tz, Journal.created_at)
    for w, m, c in db.execute(
        select(j_week, Journal.mood, func.count())
        .where(
            Journal.user_id == user_id,
            Journal.mood.is_not(None),
            j_day >= week_starts[0],
        )
        .group_by(j_week, Journal.mood)
    ):
        bucket = week_mood_counts.setdefault(w, {})
        bucket[m] = bucket.get(m, 0) + c
    mood_by_week = [
        WeekMoods(week_start=w, counts=week_mood_counts.get(w, {})) for w in week_starts
    ]

    # This calendar month vs the previous one (user's local month) — totals + deltas.
    monthly_comparison = _monthly_comparison(db, owned, local_day, today)

    # Calm & focus over time — weekly averages of session self-ratings (1–5). Purely
    # descriptive (not the statistical insight). Only weeks with at least one rated
    # session are emitted, so the chart never implies data that isn't there.
    ratings_by_week = _ratings_by_week(db, owned, local_ts, local_day, week_starts[0])

    return AnalyticsSummary(
        total_sessions=total_sessions,
        total_minutes=int(total_seconds) // 60,
        days_practiced=days_practiced,
        by_type=by_type,
        by_weekday=by_weekday,
        by_time_of_day=by_time_of_day,
        minutes_by_week=minutes_by_week,
        moods=moods,
        mood_by_week=mood_by_week,
        monthly_comparison=monthly_comparison,
        ratings_by_week=ratings_by_week,
    )


def _first_of_month(d: date) -> date:
    return d.replace(day=1)


def _prev_month_start(first_of_month: date) -> date:
    """First day of the month before the given month's first day."""
    # Step back one day from the 1st to land in the previous month, then to its 1st.
    return _first_of_month(first_of_month - timedelta(days=1))


def _month_totals(
    db: DBSession, owned, local_day, *, start: date, end: date
) -> MonthTotals:
    """Practice totals for the local-day window [start, end) (end exclusive)."""
    in_month = (local_day >= start) & (local_day < end)
    total_seconds, sessions = db.execute(
        select(
            func.coalesce(func.sum(Session.duration_seconds), 0),
            func.count(),
        ).where(owned, in_month)
    ).one()
    days_practiced = db.execute(
        select(func.count(func.distinct(local_day))).where(owned, in_month)
    ).scalar_one()
    return MonthTotals(
        month_start=start,
        minutes=int(total_seconds) // 60,
        sessions=int(sessions),
        days_practiced=int(days_practiced),
    )


def _monthly_comparison(db: DBSession, owned, local_day, today: date) -> MonthComparison:
    """This calendar month vs the previous one, both bucketed in the user's local month.

    Boundaries are computed on the user's local *date* (`today`), so the rollover at
    month's end honours the user's timezone just like every other bucket here.
    """
    this_start = _first_of_month(today)
    # +32 days from the 1st always lands in the next month; back to its 1st.
    next_start = (this_start + timedelta(days=32)).replace(day=1)
    prev_start = _prev_month_start(this_start)

    this_month = _month_totals(db, owned, local_day, start=this_start, end=next_start)
    last_month = _month_totals(db, owned, local_day, start=prev_start, end=this_start)
    return MonthComparison(
        this_month=this_month,
        last_month=last_month,
        minutes_delta=this_month.minutes - last_month.minutes,
        sessions_delta=this_month.sessions - last_month.sessions,
        days_practiced_delta=this_month.days_practiced - last_month.days_practiced,
    )


def _ratings_by_week(
    db: DBSession, owned, local_ts, local_day, since: date
) -> list[WeekRatings]:
    """Weekly calm/focus averages over rated sessions since `since`. Each average is
    over the sessions that carried *that* rating (a session may rate one and not the
    other). Only weeks with at least one rated session are returned."""
    week_col = func.date(func.date_trunc("week", local_ts))
    rated = Session.calm.is_not(None) | Session.focus.is_not(None)
    rows = db.execute(
        select(
            week_col,
            func.avg(cast(Session.calm, Float)),
            func.avg(cast(Session.focus, Float)),
            func.count().filter(rated),
        )
        .where(owned, rated, local_day >= since)
        .group_by(week_col)
        .order_by(week_col)
    )

    def _round(v) -> float | None:
        return round(float(v), 1) if v is not None else None

    return [
        WeekRatings(
            week_start=w, calm=_round(calm), focus=_round(focus), rated_sessions=int(n)
        )
        for w, calm, focus, n in rows
    ]

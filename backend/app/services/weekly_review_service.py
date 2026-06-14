"""Weekly review: a reflective summary of the last 7 local days, computed from activity
(sessions + mood check-ins + journal moods). Nothing stored — it reuses the dashboard
engine's local-day bucketing and streak logic. Powers the in-app "This week" card."""

import uuid
from collections import Counter
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.journal import Journal
from app.models.mood_log import MoodLog
from app.models.session import Session
from app.schemas.weekly_review import WeeklyReview
from app.services.dashboard_service import _compute_streaks, _local_date


def get_weekly_review(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC"
) -> WeeklyReview:
    week_start = today - timedelta(days=6)  # last 7 local days, inclusive
    prev_start = today - timedelta(days=13)
    prev_end = today - timedelta(days=7)
    sday = _local_date(tz, Session.occurred_at)

    total, count, longest = db.execute(
        select(
            func.coalesce(func.sum(Session.duration_seconds), 0),
            func.count(Session.id),
            func.coalesce(func.max(Session.duration_seconds), 0),
        ).where(Session.user_id == user_id, sday >= week_start, sday <= today)
    ).one()

    active_days = db.execute(
        select(func.count(func.distinct(sday))).where(
            Session.user_id == user_id, sday >= week_start, sday <= today
        )
    ).scalar_one()

    last_total = db.execute(
        select(func.coalesce(func.sum(Session.duration_seconds), 0)).where(
            Session.user_id == user_id, sday >= prev_start, sday <= prev_end
        )
    ).scalar_one()

    all_days = {
        r[0]
        for r in db.execute(
            select(sday).where(Session.user_id == user_id).distinct()
        ).all()
    }
    current_streak, _longest, _rest = _compute_streaks(all_days, today)

    # Moods this week: combine standalone check-ins and journal-tagged moods.
    counts: Counter[str] = Counter()
    mday = _local_date(tz, MoodLog.created_at)
    for mood, n in db.execute(
        select(MoodLog.mood, func.count(MoodLog.id))
        .where(MoodLog.user_id == user_id, mday >= week_start, mday <= today)
        .group_by(MoodLog.mood)
    ).all():
        counts[mood] += int(n)
    jday = _local_date(tz, Journal.created_at)
    for mood, n in db.execute(
        select(Journal.mood, func.count(Journal.id))
        .where(
            Journal.user_id == user_id,
            Journal.mood.is_not(None),
            jday >= week_start,
            jday <= today,
        )
        .group_by(Journal.mood)
    ).all():
        counts[mood] += int(n)
    top_mood = counts.most_common(1)[0][0] if counts else None

    return WeeklyReview(
        start=week_start,
        end=today,
        minutes=int(total) // 60,
        last_week_minutes=int(last_total) // 60,
        sessions=int(count),
        active_days=int(active_days),
        current_streak_days=current_streak,
        longest_session_seconds=int(longest),
        top_mood=top_mood,
        mood_counts=dict(counts),
    )

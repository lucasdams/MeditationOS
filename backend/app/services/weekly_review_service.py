"""Weekly review: a reflective summary of the last 7 local days, computed from activity
(sessions + mood check-ins + journal moods). Nothing stored — it reuses the dashboard
engine's local-day bucketing and streak logic. Powers the in-app "This week" card."""

import logging
import uuid
from collections import Counter
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.journal import Journal
from app.models.mood_log import MoodLog
from app.models.session import Session
from app.models.user import User
from app.schemas.weekly_review import WeeklyReview
from app.services.notifications import email
from app.services.time_utils import compute_streaks, local_date, zone

logger = logging.getLogger("meditationos.weekly_summary")

WEEKLY_SUMMARY_SUBJECT = "Your week in practice 🧘"
# Local hour from which the summary may go out on the chosen day (so it lands in the
# morning, not at midnight).
SUMMARY_SEND_HOUR = 9


def get_weekly_review(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC"
) -> WeeklyReview:
    week_start = today - timedelta(days=6)  # last 7 local days, inclusive
    prev_start = today - timedelta(days=13)
    prev_end = today - timedelta(days=7)
    sday = local_date(tz, Session.occurred_at)

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
    current_streak, _longest, _rest = compute_streaks(all_days, today)

    # Moods this week: combine standalone check-ins and journal-tagged moods.
    counts: Counter[str] = Counter()
    mday = local_date(tz, MoodLog.created_at)
    for mood, n in db.execute(
        select(MoodLog.mood, func.count(MoodLog.id))
        .where(MoodLog.user_id == user_id, mday >= week_start, mday <= today)
        .group_by(MoodLog.mood)
    ).all():
        counts[mood] += int(n)
    jday = local_date(tz, Journal.created_at)
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
    # Deterministic tie-break: most frequent, then the mood name alphabetically.
    # (Counter.most_common falls back to insertion order, which here mirrors
    # nondeterministic DB row order — two equally-common moods could flip between calls.)
    top_mood = min(counts, key=lambda m: (-counts[m], m)) if counts else None

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


# --- Weekly summary email (opt-in) -----------------------------------------------


def update_summary_settings(
    db: DBSession, user: User, *, enabled: bool, day: int | None
) -> User:
    """Enable/disable the weekly summary email and set its local send day. Disabling
    clears the day. (Input is validated by `WeeklySummaryUpdate`.)"""
    user.weekly_summary_enabled = enabled
    user.weekly_summary_day = day if enabled else None
    db.commit()
    db.refresh(user)
    return user


def _summary_body(user: User, review: WeeklyReview) -> str:
    name = user.username or "there"
    delta = review.minutes - review.last_week_minutes
    trend = (
        "about the same as last week"
        if delta == 0
        else f"{delta} min more than last week"
        if delta > 0
        else f"{abs(delta)} min less than last week"
    )
    mood = f"\nYou felt mostly {review.top_mood}." if review.top_mood else ""
    return (
        f"Hi {name},\n\n"
        "Here's your week in practice:\n\n"
        f"  • {review.minutes} minutes across {review.sessions} session(s)\n"
        f"  • {review.active_days}/7 days practiced\n"
        f"  • {review.current_streak_days}-day streak\n"
        f"  • That's {trend}."
        f"{mood}\n\n"
        f"Keep it going: {settings.app_base_url}\n\n"
        "— MeditationOS\n\n"
        "You can turn these off anytime in Settings."
    )


def send_due_weekly_summaries(db: DBSession, *, now_utc: datetime | None = None) -> int:
    """Email the weekly review to every opted-in user whose local weekday matches their
    chosen day and whose local time has reached SUMMARY_SEND_HOUR, at most once per
    ISO week. Returns the number sent."""
    now_utc = now_utc or datetime.now(UTC)
    candidates = (
        db.execute(
            select(User).where(
                User.weekly_summary_enabled.is_(True),
                User.weekly_summary_day.is_not(None),
            )
        )
        .scalars()
        .all()
    )

    sent = 0
    for user in candidates:
        tz_zone = zone(user.timezone)
        local_now = now_utc.astimezone(tz_zone)
        if local_now.weekday() != user.weekly_summary_day:
            continue
        if local_now.hour < SUMMARY_SEND_HOUR:
            continue
        if user.weekly_summary_last_sent_at is not None:
            last_local = user.weekly_summary_last_sent_at.astimezone(tz_zone)
            if last_local.isocalendar()[:2] >= local_now.isocalendar()[:2]:
                continue  # already sent this ISO week
        review = get_weekly_review(
            db, user.id, today=local_now.date(), tz=user.timezone or "UTC"
        )
        if email.send_email(
            user.email,
            WEEKLY_SUMMARY_SUBJECT,
            _summary_body(user, review),
            email.list_unsubscribe_headers(),
        ):
            user.weekly_summary_last_sent_at = now_utc
            sent += 1
    db.commit()
    return sent

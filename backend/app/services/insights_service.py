"""Honest, gentle pattern observations over a user's own practice data.

This is the "data-first" layer: it turns existing signals (session focus/calm
ratings, session type, time of day, practice consistency) into plain-language
observations — never causal or medical claims. Everything is computed in SQL,
scoped to the user, and read-only (nothing is stored).

Credibility rules (kept deliberately conservative):
- Every observation requires a minimum sample before it is shown
  (see the ``_MIN_*`` constants). We never infer a pattern from a couple of
  points; below threshold the caller gets ``needs_more_data=True`` instead.
- Differences must clear a small minimum gap to count as a pattern, so noise
  doesn't read as signal.
- Copy is a soft observation ("you tend to rate calm a little higher"), always
  paired with the basis it rests on ("based on 23 rated sessions").
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import Float, case, cast, func, select
from sqlalchemy.orm import Session as DBSession

from app.models.session import Session
from app.schemas.analytics import Insight, InsightsResponse
from app.services.time_utils import local_date

# Minimum samples before a pattern is honest enough to surface.
_MIN_RATED = 8  # rated sessions (focus or calm) for rating-based observations
_MIN_PER_GROUP = 3  # rated sessions in each side of a comparison
_MIN_DAYS = 10  # distinct practice days for the consistency observation
_MIN_WEEKS_SESSIONS = 6  # sessions across the trend window before a trend is shown

# A difference smaller than this (on the 1–5 scale) is treated as "about the same".
_MIN_RATING_GAP = 0.3

_BUCKET_LABELS = {
    "morning": "mornings",
    "afternoon": "afternoons",
    "evening": "evenings",
    "night": "late-night sits",
}


def _bucket_case(hour_col):
    """Map a local hour expression to a time-of-day bucket label."""
    return case(
        (hour_col.between(5, 11), "morning"),
        (hour_col.between(12, 16), "afternoon"),
        (hour_col.between(17, 21), "evening"),
        else_="night",
    )


def _sessions(n: int) -> str:
    return f"{n} session{'s' if n != 1 else ''}"


def get_insights(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str, weeks: int = 8
) -> InsightsResponse:
    owned = Session.user_id == user_id
    local_ts = func.timezone(tz, Session.occurred_at)
    local_hour = func.extract("hour", local_ts)
    local_day = local_date(tz, Session.occurred_at)

    insights: list[Insight] = []

    insights.extend(_time_of_day_calm(db, owned, local_hour))
    insights.extend(_breathing_vs_meditation(db, owned))
    insights.extend(_calm_trend(db, owned, local_day, today, weeks))
    insights.extend(_consistency(db, owned, local_day))

    return InsightsResponse(insights=insights, needs_more_data=not insights)


def _time_of_day_calm(db: DBSession, owned, local_hour) -> list[Insight]:
    """Compare average calm across times of day; surface the best, if it stands out."""
    bucket = _bucket_case(local_hour)
    rows = db.execute(
        select(
            bucket.label("bucket"),
            func.avg(cast(Session.calm, Float)),
            func.count(Session.calm),
        )
        .where(owned, Session.calm.is_not(None))
        .group_by(bucket)
    ).all()

    total_rated = sum(int(c) for _, _, c in rows)
    if total_rated < _MIN_RATED:
        return []

    # Only buckets with enough rated sits of their own can headline a pattern.
    eligible = [
        (b, float(avg), int(c)) for b, avg, c in rows if c >= _MIN_PER_GROUP
    ]
    if len(eligible) < 2:
        return []

    eligible.sort(key=lambda r: r[1], reverse=True)
    best_bucket, best_avg, best_count = eligible[0]
    rest = eligible[1:]
    rest_avg = sum(avg * c for _, avg, c in rest) / sum(c for _, avg, c in rest)
    if best_avg - rest_avg < _MIN_RATING_GAP:
        return []

    label = _BUCKET_LABELS.get(best_bucket, best_bucket)
    return [
        Insight(
            kind="time_of_day_calm",
            title=f"Calmest on {label}",
            detail=(
                f"On {label} you sit, you tend to rate your calm a little higher "
                "than at other times."
            ),
            basis=f"based on {_sessions(total_rated)} you rated for calm",
        )
    ]


def _breathing_vs_meditation(db: DBSession, owned) -> list[Insight]:
    """Compare average calm: resonance breathing vs other meditation."""
    group = case(
        (Session.type == "resonance_breathing", "breathing"),
        else_="meditation",
    )
    rows = {
        g: (float(avg), int(c))
        for g, avg, c in db.execute(
            select(group.label("g"), func.avg(cast(Session.calm, Float)), func.count())
            .where(owned, Session.calm.is_not(None))
            .group_by(group)
        ).all()
    }
    if "breathing" not in rows or "meditation" not in rows:
        return []

    b_avg, b_count = rows["breathing"]
    m_avg, m_count = rows["meditation"]
    if b_count < _MIN_PER_GROUP or m_count < _MIN_PER_GROUP:
        return []
    if abs(b_avg - m_avg) < _MIN_RATING_GAP:
        return []

    higher, lower = ("breathing", "meditation") if b_avg > m_avg else ("meditation", "breathing")
    phrasing = {
        "breathing": "resonance breathing",
        "meditation": "your meditation sits",
    }
    return [
        Insight(
            kind="breathing_vs_meditation",
            title="Breathing vs. meditation",
            detail=(
                f"You tend to rate calm a little higher after {phrasing[higher]} "
                f"than after {phrasing[lower]}."
            ),
            basis=f"based on {_sessions(b_count + m_count)} you rated for calm",
        )
    ]


def _calm_trend(db: DBSession, owned, local_day, today: date, weeks: int) -> list[Insight]:
    """Compare average calm in the recent half-window vs the earlier half."""
    window_start = today - timedelta(weeks=weeks)
    midpoint = today - timedelta(weeks=weeks // 2)

    recent_avg, recent_n = db.execute(
        select(func.avg(cast(Session.calm, Float)), func.count(Session.calm)).where(
            owned, Session.calm.is_not(None), local_day >= midpoint, local_day <= today
        )
    ).one()
    earlier_avg, earlier_n = db.execute(
        select(func.avg(cast(Session.calm, Float)), func.count(Session.calm)).where(
            owned, Session.calm.is_not(None), local_day >= window_start, local_day < midpoint
        )
    ).one()

    recent_n, earlier_n = int(recent_n), int(earlier_n)
    if recent_n < _MIN_PER_GROUP or earlier_n < _MIN_PER_GROUP:
        return []
    if recent_n + earlier_n < _MIN_WEEKS_SESSIONS:
        return []

    diff = float(recent_avg) - float(earlier_avg)
    if abs(diff) < _MIN_RATING_GAP:
        detail = "Your calm ratings have held fairly steady over the past weeks."
        title = "Calm holding steady"
    elif diff > 0:
        detail = "Your calm ratings have edged up a little over the past weeks."
        title = "Calm trending up"
    else:
        detail = (
            "Your calm ratings have dipped a little lately — gentle weeks happen, "
            "and showing up is what counts."
        )
        title = "A gentler stretch"

    return [
        Insight(
            kind="calm_trend",
            title=title,
            detail=detail,
            basis=f"based on {_sessions(recent_n + earlier_n)} over the past {weeks} weeks",
        )
    ]


def _consistency(db: DBSession, owned, local_day) -> list[Insight]:
    """A gentle nudge once a meaningful number of practice days exists."""
    days = db.execute(
        select(func.count(func.distinct(local_day))).where(owned)
    ).scalar_one()
    days = int(days)
    if days < _MIN_DAYS:
        return []

    return [
        Insight(
            kind="consistency",
            title="Consistency is showing up",
            detail=(
                "You've practiced on quite a few different days — small, regular sits "
                "tend to add up more than occasional long ones."
            ),
            basis=f"based on {days} days you've practiced",
        )
    ]

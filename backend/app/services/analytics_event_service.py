"""Product-analytics ingest + admin aggregation.

Ingest is deliberately tiny: validate happens in the schema, this just persists one row
(or no-ops when the kill switch is off). Aggregation returns COUNTS ONLY — never
individual event rows, user ids, or props — mirroring admin_service's privacy posture.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics_event import (
    AnalyticsEventSummary,
    DailyActiveUsers,
    EventCreate,
    EventNameCount,
)


def record_event(
    db: DBSession, data: EventCreate, user_id: uuid.UUID | None
) -> AnalyticsEvent | None:
    """Persist one event. `user_id` is None for logged-out/guest callers.

    Returns None (stores nothing) when analytics is disabled via the kill switch, so the
    endpoint can 204 without side effects.
    """
    if not settings.analytics_enabled:
        return None
    event = AnalyticsEvent(user_id=user_id, name=data.name, props=data.props)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_summary(db: DBSession, *, days: int) -> AnalyticsEventSummary:
    """Aggregate the last `days` of events: total, counts per event name, and distinct
    active users per UTC day. COUNTS ONLY — no user ids, no props, no event rows."""
    now = datetime.now(UTC)
    since = now - timedelta(days=days)

    total = int(
        db.execute(
            select(func.count())
            .select_from(AnalyticsEvent)
            .where(AnalyticsEvent.created_at >= since)
        ).scalar_one()
    )

    # Events per name, most frequent first.
    by_name = [
        EventNameCount(name=name, count=int(count))
        for name, count in db.execute(
            select(AnalyticsEvent.name, func.count())
            .where(AnalyticsEvent.created_at >= since)
            .group_by(AnalyticsEvent.name)
            .order_by(func.count().desc())
        )
    ]

    # Distinct authenticated users active per UTC day (anonymous events have user_id NULL
    # and are excluded from this tally, which is a distinct-*user* count). Zero-filled.
    event_day = func.date(func.timezone("UTC", AnalyticsEvent.created_at))
    start_day = since.date()
    counts = {
        d: int(c)
        for d, c in db.execute(
            select(event_day, func.count(func.distinct(AnalyticsEvent.user_id)))
            .where(
                AnalyticsEvent.created_at >= since,
                AnalyticsEvent.user_id.is_not(None),
            )
            .group_by(event_day)
        )
    }
    span = [start_day + timedelta(days=i) for i in range(days + 1)]
    active_by_day = [
        DailyActiveUsers(day=d.isoformat(), users=counts.get(d, 0)) for d in span
    ]

    return AnalyticsEventSummary(
        window_days=days,
        total_events=total,
        events_by_name=by_name,
        active_users_by_day=active_by_day,
    )

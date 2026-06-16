"""Scheduled-session business logic and data access, plus iCalendar (.ics) export.
All queries scoped to the user (see docs/decisions/0006-layered-architecture.md)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.scheduled_session import ScheduledSession
from app.schemas.scheduled_session import ScheduledSessionCreate
from app.services._ownership import delete_owned, get_owned

# Calendar block length when a scheduled session carries no explicit duration.
DEFAULT_ICS_MINUTES = 15

_TYPE_LABELS = {
    "mindfulness": "Mindfulness",
    "body_scan": "Body scan",
    "walking": "Walking",
    "loving_kindness": "Loving-kindness",
    "resonance_breathing": "Resonance breathing",
    "other": "Meditation",
}


def create(
    db: DBSession, user_id: uuid.UUID, data: ScheduledSessionCreate
) -> ScheduledSession:
    enforce_daily_create_cap(db, ScheduledSession, user_id)
    row = ScheduledSession(user_id=user_id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_for_user(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    upcoming_only: bool = True,
    now: datetime | None = None,
) -> list[ScheduledSession]:
    """Scheduled sessions, soonest first. Upcoming-only by default (>= now)."""
    stmt = select(ScheduledSession).where(ScheduledSession.user_id == user_id)
    if upcoming_only:
        stmt = stmt.where(ScheduledSession.scheduled_at >= (now or datetime.now(UTC)))
    stmt = stmt.order_by(ScheduledSession.scheduled_at.asc())
    return list(db.execute(stmt).scalars().all())


def get(
    db: DBSession, user_id: uuid.UUID, sched_id: uuid.UUID
) -> ScheduledSession | None:
    """Fetch one scheduled session owned by the user. None if missing or not theirs."""
    return get_owned(db, ScheduledSession, user_id, sched_id)


def delete(db: DBSession, user_id: uuid.UUID, sched_id: uuid.UUID) -> bool:
    return delete_owned(db, ScheduledSession, user_id, sched_id)


def _ics_dt(dt: datetime) -> str:
    """An iCalendar UTC timestamp (e.g. 20260614T080000Z)."""
    return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def to_ics(row: ScheduledSession) -> str:
    """A minimal, valid single-event iCalendar document for 'add to calendar'."""
    start = row.scheduled_at
    end = start + timedelta(minutes=row.duration_minutes or DEFAULT_ICS_MINUTES)
    label = _TYPE_LABELS.get(row.type, "Meditation")
    summary = f"Meditation: {label}"
    description = row.note or "Time to practice. — MeditationOS"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//MeditationOS//Schedule//EN",
        "BEGIN:VEVENT",
        f"UID:{row.id}@meditationos",
        f"DTSTAMP:{_ics_dt(row.created_at)}",
        f"DTSTART:{_ics_dt(start)}",
        f"DTEND:{_ics_dt(end)}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"

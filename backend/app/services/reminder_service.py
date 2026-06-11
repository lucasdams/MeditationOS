"""Daily practice-reminder logic: who is due, and sending the nudge.

Reminders are opt-in (see `User.reminder_*`). The send pass is timezone-aware and
idempotent (at most one reminder per user per local day) and skips anyone who has
already practiced today — "nudge, not shame". A scheduler calls
`send_due_reminders` periodically (see `app/jobs/send_reminders.py`).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.session import Session as PracticeSession
from app.models.user import User
from app.services.notifications import email

logger = logging.getLogger("meditationos.reminders")

REMINDER_SUBJECT = "Time for your meditation 🧘"


def _zone(tz: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def update_settings(db: Session, user: User, *, enabled: bool, hour: int | None) -> User:
    """Enable/disable the daily reminder and set its local hour. Clearing `enabled`
    drops the stored hour. (Input is validated by `ReminderUpdate`.)"""
    user.reminder_enabled = enabled
    user.reminder_hour = hour if enabled else None
    db.commit()
    db.refresh(user)
    return user


def _practiced_today(db: Session, user_id: uuid.UUID, today: date, tz: str) -> bool:
    local_day = func.date(func.timezone(tz, PracticeSession.occurred_at))
    row = db.execute(
        select(PracticeSession.id)
        .where(PracticeSession.user_id == user_id, local_day == today)
        .limit(1)
    ).first()
    return row is not None


def _reminder_body(user: User) -> str:
    name = user.username or "there"
    return (
        f"Hi {name},\n\n"
        "This is your daily nudge to take a few minutes to practice. Even one "
        "mindful breath keeps your streak — and your sanctuary — alive.\n\n"
        f"Start now: {settings.app_base_url}\n\n"
        "— MeditationOS\n\n"
        "You can turn these off anytime in Settings."
    )


def send_due_reminders(db: Session, *, now_utc: datetime | None = None) -> int:
    """Send a reminder to every opted-in user whose local time has reached their
    chosen hour today, who hasn't already been reminded today, and who hasn't
    practiced yet. Returns the number sent."""
    now_utc = now_utc or datetime.now(UTC)
    candidates = (
        db.execute(
            select(User).where(
                User.reminder_enabled.is_(True), User.reminder_hour.is_not(None)
            )
        )
        .scalars()
        .all()
    )

    sent = 0
    for user in candidates:
        zone = _zone(user.timezone)
        local_now = now_utc.astimezone(zone)
        if local_now.hour < user.reminder_hour:
            continue  # their hour hasn't arrived yet today
        if user.reminder_last_sent_at is not None:
            last_local = user.reminder_last_sent_at.astimezone(zone).date()
            if last_local >= local_now.date():
                continue  # already reminded today
        if _practiced_today(db, user.id, local_now.date(), user.timezone or "UTC"):
            continue  # nudge, not shame — they've already practiced
        if email.send_email(user.email, REMINDER_SUBJECT, _reminder_body(user)):
            user.reminder_last_sent_at = now_utc
            sent += 1
    db.commit()
    return sent

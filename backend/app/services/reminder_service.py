"""Daily practice-reminder logic: who is due, and sending the nudge.

Reminders are opt-in (see `User.reminder_*`). The send pass is timezone-aware and
idempotent (at most one reminder per user per local day) and skips anyone who has
already practiced today — "nudge, not shame". A scheduler calls
`send_due_reminders` periodically (see `app/jobs/send_reminders.py`).

In addition to the morning reminder, a late-day streak-save nudge fires when ALL of
these hold (evaluated on each hourly job run):
  - `reminder_enabled` is true (user is already opted into notifications);
  - the user's local hour is ≥ STREAK_SAVE_HOUR (default 20:00 — late enough to be
    genuinely at risk, early enough to still act);
  - the user has an active streak ≥ 1;
  - the streak is not currently safe via the rest-day allowance (don't nudge when the
    one-day insurance is absorbing today's gap);
  - the user hasn't practiced today;
  - no streak-save nudge has been sent yet today (`streak_save_last_sent_at`).
The nudge is independent of the morning reminder — it uses a separate timestamp so the
two channels never block each other.
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
from app.services import push_service
from app.services.notifications import email

logger = logging.getLogger("meditationos.reminders")

REMINDER_SUBJECT = "Time for your meditation 🧘"

# Local hour at which the streak-save nudge becomes eligible. Late enough that the
# user has had all day to practice; early enough to still act before midnight.
STREAK_SAVE_HOUR = 20


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


def _practice_days(db: Session, user_id: uuid.UUID, tz: str) -> set[date]:
    """Return the set of local dates on which the user has at least MIN_PRACTICE_SECONDS
    of recorded sessions. Mirrors the streak logic in dashboard_service."""
    from app.services.dashboard_service import MIN_PRACTICE_SECONDS

    local_day = func.date(func.timezone(tz, PracticeSession.occurred_at))
    rows = db.execute(
        select(local_day)
        .where(PracticeSession.user_id == user_id)
        .group_by(local_day)
        .having(func.sum(PracticeSession.duration_seconds) >= MIN_PRACTICE_SECONDS)
    ).all()
    return {row[0] for row in rows}


def _streak_at_risk(db: Session, user_id: uuid.UUID, today: date, tz: str) -> bool:
    """Return True when the user's active streak would break without practice today.

    False when:
    - the user has already practiced today (streak is safe);
    - the streak is 0 (nothing to protect);
    - the streak is leaning on the rest-day allowance for today's gap (still safe today).
    """
    from app.services.dashboard_service import _compute_streaks

    days = _practice_days(db, user_id, tz)
    if today in days:
        return False  # already practiced today
    current, _, rest_day_used = _compute_streaks(days, today)
    if current == 0:
        return False  # no active streak to protect
    if rest_day_used:
        return False  # rest-day insurance is covering today; streak is safe
    return True


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
        # Also nudge via push if they've granted it (best-effort; no-op without VAPID).
        push_service.send_to_user(
            db, user.id, REMINDER_SUBJECT, "Take a few mindful minutes — your streak is waiting."
        )
    db.commit()
    return sent


def _streak_save_body(user: User, streak: int) -> str:
    name = user.username or "there"
    streak_label = f"{streak}-day streak" if streak != 1 else "1-day streak"
    return (
        f"Hi {name},\n\n"
        f"Your {streak_label} is still going — a few quiet minutes today keeps it alive.\n\n"
        "No pressure, but if you have a moment this evening, your practice is waiting.\n\n"
        f"Open MeditationOS: {settings.app_base_url}\n\n"
        "— MeditationOS\n\n"
        "You can turn these off anytime in Settings."
    )


STREAK_SAVE_SUBJECT = "Your streak is still going — keep it alive ✨"


def send_streak_save_nudges(db: Session, *, now_utc: datetime | None = None) -> int:
    """Send a gentle late-day nudge to every opted-in user whose active streak would
    break without practice today, where the local time has reached STREAK_SAVE_HOUR and
    no streak-save nudge has been sent yet today. Returns the number sent.

    Designed to run on the same hourly schedule as `send_due_reminders` — the hour
    check inside ensures it only fires in the eligible window.
    """
    now_utc = now_utc or datetime.now(UTC)
    candidates = (
        db.execute(
            select(User).where(
                User.reminder_enabled.is_(True),
            )
        )
        .scalars()
        .all()
    )

    sent = 0
    for user in candidates:
        zone = _zone(user.timezone)
        local_now = now_utc.astimezone(zone)

        if local_now.hour < STREAK_SAVE_HOUR:
            continue  # too early in the day

        # At most one streak-save nudge per local day.
        if user.streak_save_last_sent_at is not None:
            last_local = user.streak_save_last_sent_at.astimezone(zone).date()
            if last_local >= local_now.date():
                continue

        tz = user.timezone or "UTC"
        today = local_now.date()

        if not _streak_at_risk(db, user.id, today, tz):
            continue  # already practiced, no streak, or rest-day is covering today

        # Compute current streak length for personalised copy.
        from app.services.dashboard_service import _compute_streaks

        days = _practice_days(db, user.id, tz)
        current_streak, _, _ = _compute_streaks(days, today)

        body = _streak_save_body(user, current_streak)
        if email.send_email(user.email, STREAK_SAVE_SUBJECT, body):
            user.streak_save_last_sent_at = now_utc
            sent += 1
        # Best-effort push alongside email (no-op without VAPID keys).
        push_service.send_to_user(
            db,
            user.id,
            STREAK_SAVE_SUBJECT,
            f"Your {current_streak}-day streak is still alive "
            "— a few mindful minutes keeps it going.",
        )
    db.commit()
    return sent

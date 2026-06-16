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
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.session import Session as PracticeSession
from app.models.user import User
from app.services import push_service
from app.services.notifications import email
from app.services.time_utils import compute_streaks, local_date, zone

logger = logging.getLogger("meditationos.reminders")

REMINDER_SUBJECT = "Time for your meditation 🧘"

# Local hour at which the streak-save nudge becomes eligible. Late enough that the
# user has had all day to practice; early enough to still act before midnight.
STREAK_SAVE_HOUR = 20


def update_settings(db: Session, user: User, *, enabled: bool, hour: int | None) -> User:
    """Enable/disable the daily reminder and set its local hour. Clearing `enabled`
    drops the stored hour. (Input is validated by `ReminderUpdate`.)"""
    user.reminder_enabled = enabled
    user.reminder_hour = hour if enabled else None
    db.commit()
    db.refresh(user)
    return user


# How far back the streak/grace computation can possibly reach. A streak walk only ever
# steps back one local day at a time (bridging at most REST_DAYS_PER_STREAK single-day
# gaps), so for the at-risk / current-length decision it never needs days older than a
# couple of months. We bound the scan to this window so the query never reads a user's
# entire session history; the streak result for any realistic streak is unchanged.
_STREAK_HISTORY_DAYS = 60


def _practice_days(db: Session, user_id: uuid.UUID, tz: str, *, today: date) -> set[date]:
    """Return the set of recent local dates (within the last `_STREAK_HISTORY_DAYS`) on
    which the user has at least MIN_PRACTICE_SECONDS of recorded sessions. Mirrors the
    streak logic in dashboard_service. Bounded to the recent window because the streak /
    grace computation only walks back day-by-day and never reaches older history."""
    from app.services.dashboard_service import MIN_PRACTICE_SECONDS

    window_start = today - timedelta(days=_STREAK_HISTORY_DAYS)
    local_day = local_date(tz, PracticeSession.occurred_at)
    rows = db.execute(
        select(local_day)
        .where(PracticeSession.user_id == user_id, local_day >= window_start)
        .group_by(local_day)
        .having(func.sum(PracticeSession.duration_seconds) >= MIN_PRACTICE_SECONDS)
    ).all()
    return {row[0] for row in rows}


def _at_risk_streak(days: set[date], today: date) -> int:
    """Return the active streak length when it would break without practice today, else 0.

    Accepts a pre-computed ``days`` set and computes the streak exactly once, returning
    its length so the caller can reuse it for the email/push copy (avoids a duplicate
    `compute_streaks` call). Returns 0 — meaning "not at risk, don't nudge" — when:
    - the user has already practiced today (streak is safe);
    - the streak is 0 (nothing to protect);
    - the streak is leaning on the rest-day allowance for today's gap (still safe today).
    """
    if today in days:
        return 0  # already practiced today
    current, _, rest_day_used = compute_streaks(days, today)
    if current == 0:
        return 0  # no active streak to protect
    if rest_day_used:
        return 0  # rest-day insurance is covering today; streak is safe
    return current


def _practiced_today(db: Session, user_id: uuid.UUID, today: date, tz: str) -> bool:
    local_day = local_date(tz, PracticeSession.occurred_at)
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
        tz_zone = zone(user.timezone)
        local_now = now_utc.astimezone(tz_zone)
        if local_now.hour < user.reminder_hour:
            continue  # their hour hasn't arrived yet today
        if user.reminder_last_sent_at is not None:
            last_local = user.reminder_last_sent_at.astimezone(tz_zone).date()
            if last_local >= local_now.date():
                continue  # already reminded today
        if _practiced_today(db, user.id, local_now.date(), user.timezone or "UTC"):
            continue  # nudge, not shame — they've already practiced
        # Mark as handled for the day NOW so a crash mid-send never re-nudges the user,
        # and so the push gate below sees the updated timestamp.
        user.reminder_last_sent_at = now_utc
        db.commit()  # per-user commit — crash-safe
        email.send_email(user.email, REMINDER_SUBJECT, _reminder_body(user))
        # Also nudge via push if they've granted it (best-effort; no-op without VAPID).
        # Gated on the same per-day dedup: reminder_last_sent_at was just set above.
        push_service.send_to_user(
            db, user.id, REMINDER_SUBJECT, "Take a few mindful minutes — your streak is waiting."
        )
        sent += 1
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
        tz_zone = zone(user.timezone)
        local_now = now_utc.astimezone(tz_zone)

        if local_now.hour < STREAK_SAVE_HOUR:
            continue  # too early in the day

        # At most one streak-save nudge per local day.
        if user.streak_save_last_sent_at is not None:
            last_local = user.streak_save_last_sent_at.astimezone(tz_zone).date()
            if last_local >= local_now.date():
                continue

        tz = user.timezone or "UTC"
        today = local_now.date()

        # Fetch recent practice days once; the at-risk check computes the streak a single
        # time and hands back its length for the copy (no duplicate compute_streaks).
        days = _practice_days(db, user.id, tz, today=today)

        current_streak = _at_risk_streak(days, today)
        if current_streak == 0:
            continue  # already practiced, no streak, or rest-day is covering today

        # Mark as handled for the day NOW — crash-safe; gates the push send below.
        user.streak_save_last_sent_at = now_utc
        db.commit()  # per-user commit
        body = _streak_save_body(user, current_streak)
        email.send_email(user.email, STREAK_SAVE_SUBJECT, body)
        # Best-effort push alongside email (no-op without VAPID keys).
        # Gated on the same per-day dedup: streak_save_last_sent_at was just set above.
        push_service.send_to_user(
            db,
            user.id,
            STREAK_SAVE_SUBJECT,
            f"Your {current_streak}-day streak is still alive "
            "— a few mindful minutes keeps it going.",
        )
        sent += 1
    return sent

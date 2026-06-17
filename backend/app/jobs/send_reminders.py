"""Send any due daily practice reminders, streak-save nudges, and scheduled-session
reminders.

Run from a scheduler (hourly cron / ECS scheduled task / k8s CronJob):

    python -m app.jobs.send_reminders

Both passes are idempotent (at most one message per user per local day), so running
more than once an hour is safe. The streak-save nudge fires only when the user's
local hour has reached STREAK_SAVE_HOUR (20:00) — earlier hourly runs skip it
automatically via that threshold.

A PostgreSQL advisory lock (pg_try_advisory_lock) ensures only one instance runs
at a time in a multi-replica deployment. If the lock is not available the job exits
cleanly (the other replica is already running it).
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.db import SessionLocal
from app.services import reminder_service

logging.basicConfig(level=logging.INFO)

_log = logging.getLogger("meditationos.reminders")

# Stable per-job bigint key for pg_try_advisory_lock.  Must be distinct from all
# other advisory-lock keys used in the codebase.
_ADVISORY_LOCK_KEY = 0x52656D696E64  # "Remind" in hex, fits in a signed bigint


def main() -> int:
    db = SessionLocal()
    try:
        acquired = db.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _ADVISORY_LOCK_KEY}
        ).scalar()
        if not acquired:
            _log.info(
                "send_reminders advisory lock not acquired — another instance is running; skipping"
            )
            return 0
        try:
            now_utc = datetime.now(UTC)
            count = reminder_service.send_due_reminders(db, now_utc=now_utc)
            _log.info("sent %d daily reminder(s)", count)
            streak_count = reminder_service.send_streak_save_nudges(db, now_utc=now_utc)
            _log.info("sent %d streak-save nudge(s)", streak_count)
            sched_count = reminder_service.send_scheduled_session_reminders(
                db, now_utc=now_utc
            )
            _log.info("sent %d scheduled-session reminder(s)", sched_count)
            return count + streak_count + sched_count
        finally:
            db.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": _ADVISORY_LOCK_KEY}
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()

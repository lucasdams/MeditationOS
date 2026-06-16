"""Send any due daily practice reminders and streak-save nudges.

Run from a scheduler (hourly cron / ECS scheduled task / k8s CronJob):

    python -m app.jobs.send_reminders

Both passes are idempotent (at most one message per user per local day), so running
more than once an hour is safe. The streak-save nudge fires only when the user's
local hour has reached STREAK_SAVE_HOUR (20:00) — earlier hourly runs skip it
automatically via that threshold.
"""

import logging
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.services import reminder_service

logging.basicConfig(level=logging.INFO)

_log = logging.getLogger("meditationos.reminders")


def main() -> int:
    db = SessionLocal()
    try:
        now_utc = datetime.now(UTC)
        count = reminder_service.send_due_reminders(db, now_utc=now_utc)
        _log.info("sent %d daily reminder(s)", count)
        streak_count = reminder_service.send_streak_save_nudges(db, now_utc=now_utc)
        _log.info("sent %d streak-save nudge(s)", streak_count)
        return count + streak_count
    finally:
        db.close()


if __name__ == "__main__":
    main()

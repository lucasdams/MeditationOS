"""Send any due daily practice reminders.

Run from a scheduler (hourly cron / ECS scheduled task / k8s CronJob):

    python -m app.jobs.send_reminders

The send pass is idempotent (at most one reminder per user per local day), so
running it more than once an hour is safe.
"""

import logging
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.services import reminder_service

logging.basicConfig(level=logging.INFO)


def main() -> int:
    db = SessionLocal()
    try:
        count = reminder_service.send_due_reminders(db, now_utc=datetime.now(UTC))
        logging.getLogger("meditationos.reminders").info("sent %d reminder(s)", count)
        return count
    finally:
        db.close()


if __name__ == "__main__":
    main()

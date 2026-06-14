"""Send any due weekly summary emails.

Run from a scheduler (hourly cron / ECS scheduled task / k8s CronJob):

    python -m app.jobs.send_weekly_summaries

The send pass is idempotent (at most one summary per user per ISO week), so running it
more than once an hour is safe.
"""

import logging
from datetime import UTC, datetime

from app.core.db import SessionLocal
from app.services import weekly_review_service

logging.basicConfig(level=logging.INFO)


def main() -> int:
    db = SessionLocal()
    try:
        count = weekly_review_service.send_due_weekly_summaries(db, now_utc=datetime.now(UTC))
        logging.getLogger("meditationos.weekly_summary").info("sent %d summary(ies)", count)
        return count
    finally:
        db.close()


if __name__ == "__main__":
    main()

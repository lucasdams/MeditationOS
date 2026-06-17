"""Send any due weekly summary emails.

Run from a scheduler (hourly cron / ECS scheduled task / k8s CronJob):

    python -m app.jobs.send_weekly_summaries

The send pass is idempotent (at most one summary per user per ISO week), so running it
more than once an hour is safe.

A PostgreSQL advisory lock (pg_try_advisory_lock) ensures only one instance runs
at a time in a multi-replica deployment. If the lock is not available the job exits
cleanly (the other replica is already running it).
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.db import SessionLocal
from app.services import weekly_review_service

logging.basicConfig(level=logging.INFO)

_log = logging.getLogger("meditationos.weekly_summary")

# Stable per-job bigint key for pg_try_advisory_lock.  Must be distinct from all
# other advisory-lock keys used in the codebase.
_ADVISORY_LOCK_KEY = 0x5765656B6C79  # "Weekly" in hex, fits in a signed bigint


def main() -> int:
    db = SessionLocal()
    try:
        acquired = db.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": _ADVISORY_LOCK_KEY}
        ).scalar()
        if not acquired:
            _log.info(
                "send_weekly_summaries advisory lock not acquired"
                " — another instance is running; skipping"
            )
            return 0
        try:
            count = weekly_review_service.send_due_weekly_summaries(
                db, now_utc=datetime.now(UTC)
            )
            _log.info("sent %d summary(ies)", count)
            return count
        finally:
            db.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": _ADVISORY_LOCK_KEY}
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()

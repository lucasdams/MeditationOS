"""Anti-spam: a per-user, per-day ceiling on how many rows of a given type a user
may create. Counts by `created_at` (the real insert time, not a user-set field like
`occurred_at`), over the current UTC day. Set high enough never to bother real use.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import DailyLimitError


def enforce_daily_create_cap(db: Session, model: type, user_id: uuid.UUID) -> None:
    """Raise DailyLimitError if the user has already created `daily_create_limit`
    rows of `model` since the start of the current UTC day."""
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    count = db.execute(
        select(func.count())
        .select_from(model)
        .where(model.user_id == user_id, model.created_at >= start)
    ).scalar_one()
    if count >= settings.daily_create_limit:
        raise DailyLimitError()

"""Anti-spam: a per-user, per-day ceiling on how many rows of a given type a user
may create. Counts by `created_at` (the real insert time, not a user-set field like
`occurred_at`), over the user's current *local* day. Set high enough never to bother
real use.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import DailyLimitError
from app.models.user import User
from app.services.time_utils import zone


def _local_day_start_utc(tz: str) -> datetime:
    """The user's local midnight today, expressed in UTC — so the cap window rolls over
    at the user's local day boundary, not UTC's. `created_at` is a UTC-aware timestamp,
    so the comparison stays apples-to-apples."""
    local_midnight = datetime.now(zone(tz)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return local_midnight.astimezone(UTC)


def enforce_daily_create_cap(
    db: Session, model: type, user_id: uuid.UUID, *, owner_column: str = "user_id"
) -> None:
    """Raise DailyLimitError if the user has already created `daily_create_limit`
    rows of `model` since the start of their current local day.

    Counts rows whose `owner_column` (default ``user_id``) equals `user_id`. Most
    user-owned tables key on ``user_id``; a table that records the creator under a
    different name (e.g. `friendships.requester_id`) passes that column name so the
    same per-day anti-spam cap still applies.
    """
    tz = db.execute(
        select(User.timezone).where(User.id == user_id)
    ).scalar_one_or_none()
    start = _local_day_start_utc(tz or "UTC")
    owner = getattr(model, owner_column)
    count = db.execute(
        select(func.count())
        .select_from(model)
        .where(owner == user_id, model.created_at >= start)
    ).scalar_one()
    if count >= settings.daily_create_limit:
        raise DailyLimitError()

"""Prayer journal business logic and data access. All queries scoped to the user
(mirrors app/services/journal_service.py; see docs/decisions/0006-layered-architecture.md).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.prayer import Prayer
from app.schemas.prayer import PrayerCreate, PrayerUpdate
from app.services._ownership import delete_owned, get_owned

# 5 XP per prayer — parity with a journal reflection / gratitude moment (see
# dashboard_service, which counts these rows into earned XP with the same daily cap).
PRAYER_XP = 5


def create_entry(db: DBSession, user_id: uuid.UUID, data: PrayerCreate) -> Prayer:
    """Create a prayer. Subject to the per-user daily-create cap (→ 429)."""
    enforce_daily_create_cap(db, Prayer, user_id)
    entry = Prayer(user_id=user_id, **data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_entries(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    answered: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Prayer]:
    """The user's prayers, newest first. `answered` optionally filters to only the
    answered (True) or only the still-open (False) prayers."""
    stmt = select(Prayer).where(Prayer.user_id == user_id)
    if answered is True:
        stmt = stmt.where(Prayer.answered_at.isnot(None))
    elif answered is False:
        stmt = stmt.where(Prayer.answered_at.is_(None))
    stmt = stmt.order_by(Prayer.created_at.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


def get_entry(db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> Prayer | None:
    """Fetch one prayer owned by the user. None if missing or not theirs."""
    return get_owned(db, Prayer, user_id, entry_id)


def update_entry(
    db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID, data: PrayerUpdate
) -> Prayer | None:
    """Apply a partial edit. None if the prayer isn't the caller's.

    Editing `body` replaces the text; `answered=True` stamps `answered_at` = now,
    `answered=False` clears it. Omitted fields are left untouched.
    """
    entry = get_entry(db, user_id, entry_id)
    if entry is None:
        return None
    fields = data.model_dump(exclude_unset=True)
    if "body" in fields:
        entry.body = fields["body"]
    if "answered" in fields:
        entry.answered_at = datetime.now(UTC) if fields["answered"] else None
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: DBSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> bool:
    """Delete one prayer owned by the user. Returns False if it wasn't found."""
    return delete_owned(db, Prayer, user_id, entry_id)

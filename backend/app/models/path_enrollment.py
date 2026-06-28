"""Path enrollment model — the ONLY per-user state a Path stores.

A "Path" is static catalog content (see `app/services/paths_catalog.py`). Enrolling stores
only *which path* and *when the user started it* — never a "completed" count or per-day flag.
Each day's status (done / current / locked) is DERIVED at read time from the user's real
logged activity (see `app/services/path_service.py` and
docs/decisions/0009-gamification-computed-from-activity.md). Keeping completion out of the
schema is the load-bearing rule: it can't be gamed and can't drift from the activity log.

One row per (user_id, path_id) — re-enrolling the same path resets `started_on` to today
rather than creating a second row (enforced by a unique constraint).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PathEnrollment(Base):
    __tablename__ = "path_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The catalog path id (a slug like "first-7-days"). Not an FK — the catalog lives in
    # code, not the DB. An unknown id is rejected by the route before an enrollment is made.
    path_id: Mapped[str] = mapped_column(String, nullable=False)
    # The local date the user (re-)started the path; day-1's clock starts the next day.
    started_on: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date()
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        # One enrollment per (user, path) — re-enroll updates the existing row's started_on.
        UniqueConstraint("user_id", "path_id", name="uq_path_enrollments_user_path"),
        # Listing a user's enrollments.
        Index("ix_path_enrollments_user_id", "user_id"),
    )

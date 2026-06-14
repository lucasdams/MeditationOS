"""Scheduled session model — a planned future practice (date/time + type), so users
can put practice on the calendar. Distinct from `sessions` (which records practice that
actually happened). See docs/design/data-model.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.session import SESSION_TYPES

_TYPE_LIST = ", ".join(f"'{t}'" for t in SESSION_TYPES)


class ScheduledSession(Base):
    __tablename__ = "scheduled_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    # When the user plans to practice (date + time of day, timezone-aware).
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Optional target length, in minutes.
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(f"type IN ({_TYPE_LIST})", name="ck_scheduled_sessions_type"),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_scheduled_sessions_duration_positive",
        ),
        # The "upcoming" list queries by user and time.
        Index("ix_scheduled_sessions_user_id_scheduled_at", "user_id", "scheduled_at"),
    )

"""Meditation session model. See docs/design/data-model.md.

A resonance-breathing session is just a session with `type='resonance_breathing'`
plus the optional breathing columns — it shares this table (no separate table).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
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

# Allowed session types (also enforced in the Pydantic schema for 422s).
SESSION_TYPES = (
    "mindfulness",
    "body_scan",
    "walking",
    "loving_kindness",
    "resonance_breathing",
    "other",
)
_TYPE_LIST = ", ".join(f"'{t}'" for t in SESSION_TYPES)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    # Set only for type='resonance_breathing'.
    inhale_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exhale_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cycles_completed: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("duration_seconds > 0", name="ck_sessions_duration_positive"),
        CheckConstraint(f"type IN ({_TYPE_LIST})", name="ck_sessions_type"),
        # Every dashboard/streak query filters by user and date.
        Index("ix_sessions_user_id_session_date", "user_id", "session_date"),
    )

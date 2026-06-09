"""Saved breathing patterns. Global presets have `user_id IS NULL`; user-created
patterns are owned. See docs/design/data-model.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
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


class BreathingPattern(Base):
    __tablename__ = "breathing_patterns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # NULL = a global preset available to everyone.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    inhale_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    exhale_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    is_preset: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("inhale_seconds BETWEEN 1 AND 60", name="ck_bp_inhale_range"),
        CheckConstraint("exhale_seconds BETWEEN 1 AND 60", name="ck_bp_exhale_range"),
        Index("ix_breathing_patterns_user_id", "user_id"),
    )

"""Mood check-in model — a quick, standalone "how do you feel?" log.

Distinct from a journal entry (which needs a written body): a mood check-in is a
single tap, so people log how they feel even when they don't want to write. Moods
reuse the canonical palette from `journal.py` (one source of truth), so check-ins and
journal moods feed the same analytics. See docs/design/data-model.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.journal import MOODS

_MOOD_LIST = ", ".join(f"'{m}'" for m in MOODS)


class MoodLog(Base):
    __tablename__ = "mood_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    mood: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(f"mood IN ({_MOOD_LIST})", name="ck_mood_logs_mood"),
        # Trends query by user over time.
        Index("ix_mood_logs_user_id_created_at", "user_id", "created_at"),
    )

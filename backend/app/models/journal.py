"""Meditation journal model — a written reflection, optionally tied to a session.

See docs/design/data-model.md. `mood` is an optional tag from a fixed palette
(constrained by a CHECK) so entries stay filterable; the reflection itself is free
text in `body`. A linked session uses ON DELETE SET NULL so deleting the session
keeps the reflection.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Canonical mood palette — the single source of truth (schema + the DB CHECK below
# both reference this). Optional: an entry may have no mood.
MOODS = (
    "calm",
    "content",
    "focused",
    "energized",
    "grateful",
    "hopeful",
    "excited",
    "peaceful",
    "neutral",
    "restless",
    "anxious",
    "frustrated",
    "overwhelmed",
    "tired",
    "low",
)
_MOOD_LIST = ", ".join(f"'{m}'" for m in MOODS)


class Journal(Base):
    __tablename__ = "journals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    mood: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(f"mood IS NULL OR mood IN ({_MOOD_LIST})", name="ck_journal_mood"),
        Index("ix_journals_user_id_created_at", "user_id", "created_at"),
    )

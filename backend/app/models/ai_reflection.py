"""AI reflection model — one short reflection + follow-up question per journal entry.

`journal_id` is UNIQUE (one reflection per entry, generated once and then reused).
`model` records what produced the text: an LLM model id, or "fallback" when the
curated pool was used. Rows cascade away with the user *and* with the journal entry,
so deleting a reflection's journal never strands the AI text.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AIReflection(Base):
    __tablename__ = "ai_reflections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    journal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("journals.id", ondelete="CASCADE"),
        nullable=False,
    )
    reflection_text: Mapped[str] = mapped_column(Text, nullable=False)
    followup_question: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
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
        UniqueConstraint("journal_id", name="uq_ai_reflections_journal_id"),
        # The daily-generation cap counts by user over the current day.
        Index("ix_ai_reflections_user_id_created_at", "user_id", "created_at"),
    )

"""In-app feedback model — a calm way for a user to send us a note from inside the app.

A single free-text message tagged with a coarse category (bug / idea / praise / other)
and, for context, the app route it was sent from. The owner reads these in the admin
area (their support inbox). `user_id` is nullable + ON DELETE SET NULL so a note survives
the sender deleting their account (the feedback stays useful even without an author).
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# The coarse buckets a note can carry. Kept small and stable — a check constraint mirrors
# this list in the DB, and the Pydantic schema validates against the same set.
CATEGORIES = ("bug", "idea", "praise", "other")
_CATEGORY_LIST = ", ".join(f"'{c}'" for c in CATEGORIES)

# Message cap — long enough for a real note, short enough to resist abuse. Mirrored in the
# Pydantic schema (max_length) and enforced again by the DB check constraint.
MAX_MESSAGE_LENGTH = 2000


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Nullable + SET NULL: keep the note if the sender later deletes their account.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    category: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # The app route the note was sent from (e.g. "/breathe") — context for triage.
    path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            f"category IN ({_CATEGORY_LIST})", name="ck_feedback_category"
        ),
        CheckConstraint(
            f"char_length(message) <= {MAX_MESSAGE_LENGTH}",
            name="ck_feedback_message_length",
        ),
        # The admin inbox reads newest-first.
        Index("ix_feedback_created_at", "created_at"),
    )

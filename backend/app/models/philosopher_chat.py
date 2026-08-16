"""Saved philosopher-chat conversations.

v1 of the philosopher feature was stateless (the client held the conversation). This adds
opt-in persistence so a conversation can be reopened later: one row per conversation, owned
by a user, tied to a persona `philosopher_id`, with the turns stored as a JSONB list. The
whole (bounded) message list is rewritten on each turn — conversations are short and always
sent in full — so there is no separate messages table.

The stored content is personal reflection, so rows cascade away with the user and are always
scoped to `user_id` in the service (a delete path is provided). Content is never logged.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PhilosopherChat(Base):
    __tablename__ = "philosopher_chats"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The persona id (e.g. "marcus-aurelius"). Not an FK — the roster lives in code, not a
    # table — so it's a plain string matching app/prompts/philosophers.py ids.
    philosopher_id: Mapped[str] = mapped_column(String, nullable=False)
    # A short label for the list, derived from the first user message.
    title: Mapped[str] = mapped_column(String, nullable=False)
    # The conversation turns: a list of {"role": "user"|"assistant", "content": str}. Rewritten
    # in full each turn (conversations are short and bounded by the request schema).
    messages: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
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
        # The conversations list is "this user's, newest first".
        Index("ix_philosopher_chats_user_id_updated_at", "user_id", "updated_at"),
    )

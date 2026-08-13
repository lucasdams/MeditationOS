"""Prayer journal model — a written prayer, intention, or blessing the user can
revisit and optionally mark as answered.

Tradition-agnostic: the entry itself is free text in `body` (no denomination or
category is stored). `answered_at` is an optional timestamp the user sets when a
prayer feels answered — NULL means "still open". Mirrors the meditation journal
(see app/models/journal.py) so the two written-reflection tools stay consistent.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Prayer(Base):
    __tablename__ = "prayers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # NULL while the prayer is still open; set to "now" when the user marks it answered.
    answered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
        Index("ix_prayers_user_id_created_at", "user_id", "created_at"),
    )

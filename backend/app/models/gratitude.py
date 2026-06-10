"""Gratitude entry model — a logged moment of gratitude in a fixed category.

See docs/design/data-model.md. Categories are a fixed taxonomy (constrained by a
CHECK) so entries stay filterable; the precise prompt the user picks/types is free
text in `text`.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Canonical category taxonomy — the single source of truth (schema + service + the
# DB CHECK below all reference this).
CATEGORIES = (
    "people",
    "health",
    "nature",
    "experiences",
    "growth",
    "home",
    "self",
    "simple_pleasures",
    "small_moments",
    "big_moments",
    "spiritual",
    "material",
    "work",
    "food",
    "learning",
    "creativity",
    "kindness",
    "music",
    "animals",
    "travel",
    "friendship",
    "family",
    "love",
    "play",
    "memories",
    "hope",
    "body",
    "mind",
    "mornings",
    "evenings",
    "weather",
    "comfort",
    "freedom",
    "abundance",
    "community",
    "beauty",
)
_CATEGORY_LIST = ", ".join(f"'{c}'" for c in CATEGORIES)


class GratitudeEntry(Base):
    __tablename__ = "gratitude_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(f"category IN ({_CATEGORY_LIST})", name="ck_gratitude_category"),
        Index("ix_gratitude_entries_user_id_created_at", "user_id", "created_at"),
    )

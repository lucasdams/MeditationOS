"""Sanctuary planting model — one item in the user's cultivation sequence.

The *only* stored Sanctuary state (ADR-0010): an append-only, ordered list of what the
user chose to grow. Progress, completion, the current item, and unlocks are all
computed on read from activity — nothing about growth is stored here.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SanctuaryPlanting(Base):
    __tablename__ = "sanctuary_plantings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # References the in-code SANCTUARY_CATALOG (not a DB FK — the catalog lives in code).
    item_key: Mapped[str] = mapped_column(String, nullable=False)
    # Order in the growth sequence: 0, 1, 2, … (repeats of an item_key are allowed).
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "position", name="uq_sanctuary_plantings_user_position"),
        Index("ix_sanctuary_plantings_user_id", "user_id"),
    )

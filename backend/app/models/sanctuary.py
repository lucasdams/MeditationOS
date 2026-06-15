"""Sanctuary item model — one item the user owns, at a given upgrade tier.

The only stored Sanctuary state (ADR-0011): which items the user has bought and each
item's `tier`. The coin balance is computed on read (coins earned from levels − coins
spent on what's owned). Item costs / tiers live in code (SANCTUARY_CATALOG).
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
    # Display order: 0, 1, 2, … (repeats of an item_key are allowed).
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Upgrade tier: 0 = base, each purchased upgrade bumps it. Drives cost + art.
    tier: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "position", name="uq_sanctuary_plantings_user_position"),
        Index("ix_sanctuary_plantings_user_id", "user_id"),
    )

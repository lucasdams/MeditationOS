"""Sanctuary item model — one item the user owns, with a chosen variant and a set of
mix-and-match customizations.

The only stored Sanctuary state (ADR-0011 + ADR-0012): which items the user has bought,
each item's `variant` (base form), and its `customizations` (`{slot: option}`). The coin
balance is computed on read (coins earned from levels − coins spent on what's owned).
What things cost — buy price, variants, customization options — lives in code
(SANCTUARY_CATALOG), so retuning needs no migration.

Two integer keys are kept deliberately separate (ADR-0014):
- `position` — the immutable **acquisition order**. The progressive pricing surcharge is
  keyed off it (the k-th item bought pays more), so it must never be reordered or the
  derived balance would silently shift.
- `cell` — the **grid layout** slot (a row-major index) the user rearranges freely by
  dragging items around. Layout-only; it has no effect on cost.
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
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    # Acquisition order: 0, 1, 2, … assigned at buy time and never changed. The progressive
    # pricing surcharge is keyed off this (ADR-0013), so it is an immutable economy key —
    # NOT the grid layout. (Repeats of an item_key are allowed.)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Grid layout slot: a row-major cell index the user rearranges freely (ADR-0014).
    # Layout-only — it never affects cost. Backfilled to `position` for existing rows.
    cell: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Chosen base form (e.g. a dog breed, a tree species). NULL = the item's default
    # variant (legacy rows + items that have no variants).
    variant: Mapped[str | None] = mapped_column(String, nullable=True)
    # Mix-and-match customizations as {slot: option} (e.g. {"grown": "grown",
    # "accessory": "hat"}). Each entry was bought with coins; the catalog prices them.
    # Empty {} = the base form (legacy rows), so no extra spend.
    customizations: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "position", name="uq_sanctuary_plantings_user_position"),
        UniqueConstraint("user_id", "cell", name="uq_sanctuary_plantings_user_cell"),
        Index("ix_sanctuary_plantings_user_id", "user_id"),
    )

"""Spirit model — one living companion the user awakens and grows through practice
(docs/design/spirit.md, ADR-0022).

Maximally computed, in keeping with ADR-0009 (gamification computed from activity) and
ADR-0011 (the holdings *are* the ledger): the only stored state is the irreducible
decisions — the committed `path`, the optional `name`, and the owned `cosmetics`. Stage,
bond, daily glow, and coins are all derived on read from the user's earned-XP level.

- **Active spirit** = the row with `retired_at IS NULL` (enforced by a partial unique
  index — at most one active spirit per user).
- **Collection** = a user's `retired_at IS NOT NULL` rows (past radiant spirits, kept
  forever; populated only once `/awaken` ships in a later step).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Spirit(Base):
    __tablename__ = "spirits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The committed path: stillness | breath | heart. NULL = a pathless spark (pre-commit).
    # Set ONCE at the commit stage from the user's dominant practice (a crystallized decision,
    # like a Sanctuary purchase — not derivable after the fact because hysteresis must prevent
    # it flip-flopping). Stays NULL in step 1 (no path branching yet).
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional nickname (cosmetic). Trimmed + length-capped server-side; NULL = unnamed.
    name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Owned cosmetics as {slot: option} — the spend ledger (ADR-0011). Default {} = no spend.
    cosmetics: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    awakened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Set when a radiant spirit is retired (user awakens a new one). NULL = the active spirit.
    retired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    __table_args__ = (
        Index("ix_spirits_user_id", "user_id"),
        # At most one ACTIVE spirit per user (a retired spirit no longer blocks a new one).
        Index(
            "uq_spirits_user_active",
            "user_id",
            unique=True,
            postgresql_where=text("retired_at IS NULL"),
        ),
    )

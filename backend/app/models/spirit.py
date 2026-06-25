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

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
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
    # USER-CHOSEN once via `choose_path` while the spirit is still pathless (ADR-0023), then
    # immutable — it is a crystallized decision, not auto-detected from the practice mix.
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional nickname (cosmetic). Trimmed + length-capped server-side; NULL = unnamed.
    name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Owned cosmetics as {slot: option} — the applied upgrades (ADR-0011). Default {} = none.
    cosmetics: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    # The STORED, monotonic spend ledger (ADR-0024). Coins are `level × COINS_PER_LEVEL −
    # coins_spent`, clamped ≥ 0. Every upgrade and paid reset only ADDS to this; clearing
    # cosmetics or resetting the name never refunds it (a committed-choice economy), so the
    # spend can't be recovered by undoing a purchase. Replaces deriving spend from the owned
    # cosmetics (which a swap/clear could lower). Never decreases.
    coins_spent: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    # Last time a cosmetic was BOUGHT for this spirit (ADR-0025). Buying "pampers" the spirit:
    # the needs read adds a decaying pamper bonus (full right after a purchase, fading to 0 over
    # PAMPER_WINDOW_DAYS). NULL = never pampered → no bonus. Visual-only, like the needs it lifts;
    # the paid resets/awaken never set it. Stored (consistent with ADR-0024's coins_spent).
    last_pampered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
        # The spend ledger is monotonic and never negative (ADR-0024).
        CheckConstraint("coins_spent >= 0", name="ck_spirits_coins_spent_nonneg"),
        Index("ix_spirits_user_id", "user_id"),
        # At most one ACTIVE spirit per user (a retired spirit no longer blocks a new one).
        Index(
            "uq_spirits_user_active",
            "user_id",
            unique=True,
            postgresql_where=text("retired_at IS NULL"),
        ),
    )

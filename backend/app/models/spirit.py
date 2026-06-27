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
    # The EQUIPPED loadout as {slot: option} (ADR-0027): one owned option shown per slot, or the
    # slot absent when empty. Default {} = nothing equipped. (Pre-ADR-0027 this WAS the owned set;
    # those already-equipped items still count as owned via the effective-owned union below.)
    cosmetics: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    # The owned COLLECTION as a JSONB list of unlocked option keys (ADR-0027). Unlocking an option
    # appends its key here (and equips it); ownership is forever. The EFFECTIVE owned set is
    # `unlocked ∪ values(cosmetics)`, so legacy spirits keep every item they had equipped without a
    # backfill. Default [] = nothing unlocked yet.
    unlocked: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    # The STORED, monotonic spend ledger (ADR-0024). Coins are `level × COINS_PER_LEVEL −
    # coins_spent`, clamped ≥ 0. Every upgrade and paid reset only ADDS to this; clearing
    # cosmetics or resetting the name never refunds it (a committed-choice economy), so the
    # spend can't be recovered by undoing a purchase. Replaces deriving spend from the owned
    # cosmetics (which a swap/clear could lower). Never decreases.
    coins_spent: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    # Last time a cosmetic was UNLOCKED for this spirit (ADR-0025). It once added a decaying,
    # visual-only "pamper" needs boost; ADR-0029 REMOVED that effect (cosmetics are purely cosmetic
    # now). Still STAMPED on unlock for forward-compat, but nothing reads it. Kept (not dropped) to
    # avoid a needless migration. NULL = never unlocked a cosmetic.
    last_pampered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # The need the LAST-unlocked cosmetic FAVOURS (ADR-0026): nourished | rested | joyful. Set
    # alongside `last_pampered_at` on every unlock. Like `last_pampered_at`, its needs effect was
    # removed by ADR-0029 — stamped for forward-compat only, read by nothing. Kept, not dropped.
    last_pampered_need: Mapped[str | None] = mapped_column(Text, nullable=True)
    awakened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # The "born fed" anchor for the real-time needs decay (ADR-0029, the Tamagotchi turn). Each
    # need's value falls from full to empty over DECAY_DAYS since it was last fed; the fed time is
    # `max(needs_baseline_at, last relevant practice)`, so this baseline guarantees a need starts
    # full at awaken (and, via the migration's server_default = now(), that EXISTING spirits start
    # fed on deploy — no mass-death). Set to the awaken/creation time for a new spirit.
    needs_baseline_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Last manual TEND per need (ADR-0029): the Feed / Rest / Play actions stamp these. A tend lifts
    # that need to TEND_CAP and then decays like practice (over DECAY_DAYS), so it keeps the spirit
    # alive between sessions without making it thrive. NULL = never tended that need.
    nourished_tended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rested_tended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joyful_tended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Death timestamp (ADR-0029): NULL = alive. When the weakest need has been empty for DEATH_DAYS
    # the spirit dies; the real death moment (which may be in the past) is PERSISTED here lazily on
    # the first read that detects it, freezing it. Death is TERMINAL — once set, later practice/tend
    # can't revive it; the user must awaken a new spirit (the retire→awaken flow, now reachable from
    # death as well as radiant).
    died_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

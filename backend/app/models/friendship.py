"""Friendship model — a social link between two users (see docs/future-features.md
→ "Friends"). One row per relationship, in one of two states:

  - ``pending``  : `requester_id` asked to befriend `addressee_id`; awaiting a reply.
  - ``accepted`` : both are friends and can see each other's stat summary.

A friendship is inherently *unordered* — Alice-and-Bob is the same relationship as
Bob-and-Alice — but the row keeps the direction (who asked) so only the addressee can
accept/decline a pending request. To stop a duplicate or mirror row (Alice→Bob AND
Bob→Alice) we also store a *canonical* pair (`user_low`, `user_high` — the two ids
sorted) and put the UNIQUE constraint there, so the pair is unique regardless of who
sent the request. Both are set in the service (not DB-generated) to keep the ORM the
single source of truth for the autogenerate drift check.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Single source of truth for the status vocabulary (schema + the DB CHECK reference it).
FRIENDSHIP_STATUSES = ("pending", "accepted")
_STATUS_LIST = ", ".join(f"'{s}'" for s in FRIENDSHIP_STATUSES)


class Friendship(Base):
    __tablename__ = "friendships"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Who sent the request / who received it. Direction is kept so only the
    # addressee may accept or decline a pending request. Both cascade-delete with
    # their user, so removing an account tears down all their friendships.
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    addressee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The same pair sorted (least, greatest). Carries the UNIQUE constraint so two
    # users can't hold two rows (including the mirror Alice→Bob / Bob→Alice). Set by
    # the service from (requester_id, addressee_id); never user-supplied.
    user_low: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_high: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="pending", default="pending"
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
        CheckConstraint(f"status IN ({_STATUS_LIST})", name="ck_friendship_status"),
        # A user can't befriend themselves, at the DB level too.
        CheckConstraint("user_low <> user_high", name="ck_friendship_distinct"),
        # One relationship per unordered pair — blocks duplicates and mirror rows.
        UniqueConstraint("user_low", "user_high", name="uq_friendship_pair"),
        # "My friendships" lookups hit either side of the relationship, so index both
        # endpoints (each paired with status for the pending-vs-accepted filters).
        Index("ix_friendships_requester_status", "requester_id", "status"),
        Index("ix_friendships_addressee_status", "addressee_id", "status"),
    )

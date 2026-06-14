"""Web Push subscription — a browser push endpoint a user has granted, so we can send
practice nudges as push notifications (richer than email). One row per browser/endpoint.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint: Mapped[str] = mapped_column(String, nullable=False)
    # The browser's public key + auth secret for this subscription (from the
    # PushSubscription.keys the client sends). Needed to encrypt the push payload.
    p256dh: Mapped[str] = mapped_column(String, nullable=False)
    auth: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # A given endpoint belongs to one user; re-subscribing upserts.
        UniqueConstraint("user_id", "endpoint", name="uq_push_subscriptions_user_endpoint"),
        Index("ix_push_subscriptions_user_id", "user_id"),
    )

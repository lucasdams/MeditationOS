"""First-party product-analytics event.

A single anonymous usage event — activation/retention signals (session completed,
path enrolled, streak milestone …). Self-hosted in our own Postgres so we can measure
the product WITHOUT a third-party SDK, matching the app's privacy-first ethos.

PRIVACY:
- `name` is drawn from a fixed server-side ALLOWLIST (see app/schemas/analytics_event.py),
  so this table can never become an arbitrary PII sink.
- `props` is a small JSONB bag of scalar, non-PII context (e.g. {"type": "breathing"}) —
  never journal/gratitude text, emails, or names. Shape + size are enforced by the schema.
- `user_id` is NULLABLE with `ON DELETE SET NULL`: events outlive account deletion but get
  de-linked, so aggregate history survives while no deleted user stays identifiable.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Nullable + SET NULL: an event survives account deletion but de-links from the user.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    props: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = (
        # Admin summary groups by event name over a time window.
        Index("ix_analytics_events_name_created_at", "name", "created_at"),
        # Distinct-active-users aggregation filters/groups by user.
        Index("ix_analytics_events_user_id", "user_id"),
    )

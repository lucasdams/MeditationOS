"""Audit log model.

An append-only trail of privileged admin actions: who (actor) did what (action) to
whom (optional target), with structured, non-sensitive `detail` (ids/flags only — never
journal/gratitude/mood body text or other private content).

Rows are intentionally NOT cascade-deleted with their actor/target: the trail must
survive an account's deletion, so both FKs use `ON DELETE SET NULL` and are nullable.
That keeps "admin X deleted user Y" auditable even after Y (or X) is gone.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # The admin who performed the action. SET NULL (not CASCADE) so the trail outlives
    # the actor's account; nullable so the row survives that deletion.
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # The account acted upon, when the action targets a specific user. NULL for
    # actions with no single target.
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String, nullable=False)
    # Structured context: ids, flags, before/after states — NEVER private content.
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # The read endpoint lists newest-first; the two FK indexes support
        # filtering/joining by actor or target.
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_actor_user_id", "actor_user_id"),
        Index("ix_audit_logs_target_user_id", "target_user_id"),
    )

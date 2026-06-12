"""Goal model — a user-set practice target. See docs/design/data-model.md.

Only the *intent* is stored (type + target + lifecycle status); **progress and
achievement are computed on read** from activity, like streaks/XP (ADR-0009). So
there's no stored "completed" — a goal is `active` or `archived`, and whether it's
currently met is derived.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# What a goal measures (single source of truth: schema + the DB CHECK reference this).
GOAL_TYPES = ("daily_minutes", "streak_days", "total_hours")
GOAL_STATUSES = ("active", "archived")
_TYPE_LIST = ", ".join(f"'{t}'" for t in GOAL_TYPES)
_STATUS_LIST = ", ".join(f"'{s}'" for s in GOAL_STATUSES)


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    target: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="active", default="active"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(f"type IN ({_TYPE_LIST})", name="ck_goal_type"),
        CheckConstraint(f"status IN ({_STATUS_LIST})", name="ck_goal_status"),
        CheckConstraint("target > 0", name="ck_goal_target_positive"),
        Index("ix_goals_user_id_created_at", "user_id", "created_at"),
    )

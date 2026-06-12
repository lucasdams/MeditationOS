"""Goal model — a recurring practice habit: do an *activity* a *count* of times per
*period* (e.g. "journal once a day", "breathe 3 times a week"). See data-model.md.

Only the intent is stored (activity + cadence + lifecycle status); **progress in the
current period is computed on read** from activity, like streaks/XP (ADR-0009). No
stored "completed" — a goal is `active` or `archived`, and whether it's met this
period is derived.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Single source of truth (schema + the DB CHECKs reference these).
GOAL_ACTIVITIES = ("meditate", "breathe", "gratitude", "journal")
GOAL_PERIODS = ("day", "week")
GOAL_STATUSES = ("active", "archived")
_ACTIVITY_LIST = ", ".join(f"'{a}'" for a in GOAL_ACTIVITIES)
_PERIOD_LIST = ", ".join(f"'{p}'" for p in GOAL_PERIODS)
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
    activity: Mapped[str] = mapped_column(String, nullable=False)  # what to do
    period: Mapped[str] = mapped_column(String, nullable=False)  # "day" | "week"
    count: Mapped[int] = mapped_column(Integer, nullable=False)  # times per period
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="active", default="active"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(f"activity IN ({_ACTIVITY_LIST})", name="ck_goal_activity"),
        CheckConstraint(f"period IN ({_PERIOD_LIST})", name="ck_goal_period"),
        CheckConstraint(f"status IN ({_STATUS_LIST})", name="ck_goal_status"),
        CheckConstraint("count > 0", name="ck_goal_count_positive"),
        Index("ix_goals_user_id_created_at", "user_id", "created_at"),
    )

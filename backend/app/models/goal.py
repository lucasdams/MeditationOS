"""Goal model — a recurring habit: do an *activity* a *count* of times per *period*
(e.g. "journal once a day", "breathe 3 times a week"). See data-model.md.

For the built-in activities (meditate/breathe/gratitude/journal) only the intent is
stored; **progress is computed on read** from activity, like streaks/XP (ADR-0009).

A `custom` goal tracks something the app *doesn't* record (e.g. "Gym", "Read") — it
carries a free-text `label` and the user marks it done via stored `goal_checkins`
rows (one per local day). This stored-progress path is a deliberate exception to
ADR-0009: there's no activity to derive from, so the user self-reports.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Single source of truth (schema + the DB CHECKs reference these).
GOAL_ACTIVITIES = ("meditate", "breathe", "gratitude", "journal", "custom")
# "total" is an all-time cumulative target (e.g. "meditate 100 times total"),
# as opposed to the recurring day/week cadences.
GOAL_PERIODS = ("day", "week", "total")
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
    # Free-text name for a `custom` goal ("Gym"); NULL for built-in activities.
    label: Mapped[str | None] = mapped_column(String, nullable=True)
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


class GoalCheckin(Base):
    """A manual "did it today" mark for a `custom` goal. At most one per local day
    (the unique constraint), so a weekly cadence counts distinct days. Owned by the
    user for scoping + cascade-on-delete with both the goal and the user.
    """

    __tablename__ = "goal_checkins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # The user's *local* day this check-in counts for (set at write time).
    checkin_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("goal_id", "checkin_date", name="uq_goal_checkin_day"),
        Index("ix_goal_checkins_user_id_date", "user_id", "checkin_date"),
    )

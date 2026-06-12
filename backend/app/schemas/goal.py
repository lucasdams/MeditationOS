"""Goal request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GoalActivity = Literal["meditate", "breathe", "gratitude", "journal"]
GoalPeriod = Literal["day", "week"]
GoalStatus = Literal["active", "archived"]


class GoalCreate(BaseModel):
    """A new habit goal: do `activity` `count` times per `period`."""

    activity: GoalActivity
    period: GoalPeriod
    count: int = Field(gt=0, le=50)


class GoalUpdate(BaseModel):
    """Edit a goal's cadence or archive/reactivate it."""

    count: int | None = Field(default=None, gt=0, le=50)
    period: GoalPeriod | None = None
    status: GoalStatus | None = None


class GoalRead(BaseModel):
    """A goal with its progress in the current period."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    activity: str
    period: str  # "day" | "week"
    count: int  # target times per period
    status: str
    done: int  # times the activity was done this period
    progress: float  # 0.0 .. 1.0, capped
    achieved: bool  # done >= count this period
    created_at: datetime

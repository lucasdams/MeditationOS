"""Goal request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GoalType = Literal["daily_minutes", "streak_days", "total_hours"]
GoalStatus = Literal["active", "archived"]


class GoalCreate(BaseModel):
    """A new practice target."""

    type: GoalType
    target: int = Field(gt=0)


class GoalUpdate(BaseModel):
    """Edit a goal's target or archive/reactivate it."""

    target: int | None = Field(default=None, gt=0)
    status: GoalStatus | None = None


class GoalRead(BaseModel):
    """A goal with its computed progress (current value, fraction, achieved)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    target: int
    status: str
    current: int  # current value in the goal's unit (minutes / days / hours)
    progress: float  # 0.0 .. 1.0, capped
    achieved: bool  # current value has reached the target right now
    created_at: datetime

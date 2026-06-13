"""Goal request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

GoalActivity = Literal["meditate", "breathe", "gratitude", "journal", "custom"]
GoalPeriod = Literal["day", "week"]
GoalStatus = Literal["active", "archived"]


class GoalCreate(BaseModel):
    """A new habit goal: do `activity` `count` times per `period`. A `custom` goal
    additionally carries a `label` (its name) and is tracked via manual check-ins."""

    activity: GoalActivity
    period: GoalPeriod
    count: int = Field(gt=0, le=50)
    # Required for custom goals (the habit name); rejected for built-in activities.
    label: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _check_label(self) -> "GoalCreate":
        label = (self.label or "").strip()
        if self.activity == "custom":
            if not label:
                raise ValueError("A custom goal needs a label.")
            self.label = label
        elif label:
            raise ValueError("Only custom goals can have a label.")
        else:
            self.label = None
        return self


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
    label: str | None  # the habit name for custom goals; None for built-in activities
    period: str  # "day" | "week"
    count: int  # target times per period
    status: str
    done: int  # times the activity was done this period
    progress: float  # 0.0 .. 1.0, capped
    achieved: bool  # done >= count this period
    checked_in_today: bool  # custom goals only — is today already marked done?
    created_at: datetime

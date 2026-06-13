"""Session request/response schemas.

`breaths_per_minute` is derived from the breathing columns in the response and
never stored (see docs/design/data-model.md).
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

SessionType = Literal[
    "mindfulness",
    "body_scan",
    "walking",
    "loving_kindness",
    "resonance_breathing",
    "other",
]


class SessionCreate(BaseModel):
    type: SessionType
    duration_seconds: int = Field(gt=0)
    occurred_at: datetime
    notes: str | None = Field(default=None, max_length=2000)
    focus: int | None = Field(default=None, ge=1, le=5)
    calm: int | None = Field(default=None, ge=1, le=5)
    inhale_seconds: int | None = Field(default=None, gt=0)
    exhale_seconds: int | None = Field(default=None, gt=0)
    cycles_completed: int | None = Field(default=None, ge=0)


class SessionUpdate(BaseModel):
    """All fields optional — only provided fields are changed."""

    type: SessionType | None = None
    duration_seconds: int | None = Field(default=None, gt=0)
    occurred_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)
    focus: int | None = Field(default=None, ge=1, le=5)
    calm: int | None = Field(default=None, ge=1, le=5)
    inhale_seconds: int | None = Field(default=None, gt=0)
    exhale_seconds: int | None = Field(default=None, gt=0)
    cycles_completed: int | None = Field(default=None, ge=0)


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    duration_seconds: int
    occurred_at: datetime
    notes: str | None
    focus: int | None
    calm: int | None
    inhale_seconds: int | None
    exhale_seconds: int | None
    cycles_completed: int | None
    created_at: datetime

    @computed_field
    @property
    def breaths_per_minute(self) -> float | None:
        """60 / (inhale + exhale), when both are set; else None."""
        if self.inhale_seconds and self.exhale_seconds:
            return round(60 / (self.inhale_seconds + self.exhale_seconds), 2)
        return None

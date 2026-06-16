"""Session request/response schemas.

`breaths_per_minute` is derived from the breathing columns in the response and
never stored (see docs/design/data-model.md).
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

SessionType = Literal[
    "mindfulness",
    "body_scan",
    "walking",
    "loving_kindness",
    "resonance_breathing",
    "other",
]


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: SessionType
    # Capped at 24h: an unbounded value would inflate XP→level→coins and break the
    # sanctuary economy.
    duration_seconds: int = Field(gt=0, le=86_400)
    occurred_at: datetime
    notes: str | None = Field(default=None, max_length=2000)
    focus: int | None = Field(default=None, ge=1, le=5)
    calm: int | None = Field(default=None, ge=1, le=5)
    inhale_seconds: int | None = Field(default=None, gt=0)
    exhale_seconds: int | None = Field(default=None, gt=0)
    cycles_completed: int | None = Field(default=None, ge=0)
    # Optional pre-session intention, trimmed and coerced to null when blank.
    intention: str | None = Field(default=None, max_length=140)
    # Optional client idempotency key — a save with a token already seen for this user
    # returns the existing session instead of creating a duplicate (auto-save + manual).
    client_token: str | None = Field(default=None, max_length=64)

    @field_validator("intention", mode="before")
    @classmethod
    def _trim_intention(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v


class SessionUpdate(BaseModel):
    """All fields optional — only provided fields are changed."""

    model_config = ConfigDict(extra="forbid")

    type: SessionType | None = None
    duration_seconds: int | None = Field(default=None, gt=0, le=86_400)
    occurred_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)
    focus: int | None = Field(default=None, ge=1, le=5)
    calm: int | None = Field(default=None, ge=1, le=5)
    inhale_seconds: int | None = Field(default=None, gt=0)
    exhale_seconds: int | None = Field(default=None, gt=0)
    cycles_completed: int | None = Field(default=None, ge=0)
    intention: str | None = Field(default=None, max_length=140)

    @field_validator("intention", mode="before")
    @classmethod
    def _trim_intention(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v


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
    intention: str | None
    created_at: datetime

    @computed_field
    @property
    def breaths_per_minute(self) -> float | None:
        """60 / (inhale + exhale), when both are set; else None."""
        if self.inhale_seconds and self.exhale_seconds:
            return round(60 / (self.inhale_seconds + self.exhale_seconds), 2)
        return None

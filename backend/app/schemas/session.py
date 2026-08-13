"""Session request/response schemas.

`breaths_per_minute` is derived from the breathing columns in the response and
never stored (see docs/design/data-model.md).
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    computed_field,
)

from app.schemas._validators import (
    _capped_blank_to_none,
    reject_implausible_timestamp,
)

# A user-set occurrence time, clamped to a plausible window (not far-future / far-past)
# so a bogus date can't inflate total minutes → XP → coins or skew the heatmap window.
OccurredAt = Annotated[datetime, AfterValidator(reject_implausible_timestamp)]
# Upper bound for a single breath phase (10 min). Patterns cap at 60s; an ad-hoc logged
# sit can run longer, but an unbounded value would distort breaths_per_minute.
BREATH_PHASE_MAX_SECONDS = 600

SessionType = Literal[
    "mindfulness",
    "body_scan",
    "walking",
    "loving_kindness",
    "resonance_breathing",
    "energizing_breathing",
    "other",
]

# Optional pre-session intention: trimmed, blank → None, capped at 140 chars (422 if over).
INTENTION_MAX_LENGTH = 140
Intention = Annotated[
    str | None, BeforeValidator(_capped_blank_to_none(INTENTION_MAX_LENGTH))
]


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: SessionType
    # Capped at 24h: an unbounded value would inflate XP→level→coins and break the
    # sanctuary economy.
    duration_seconds: int = Field(gt=0, le=86_400)
    occurred_at: OccurredAt
    notes: str | None = Field(default=None, max_length=2000)
    focus: int | None = Field(default=None, ge=1, le=5)
    calm: int | None = Field(default=None, ge=1, le=5)
    inhale_seconds: int | None = Field(default=None, gt=0, le=BREATH_PHASE_MAX_SECONDS)
    exhale_seconds: int | None = Field(default=None, gt=0, le=BREATH_PHASE_MAX_SECONDS)
    cycles_completed: int | None = Field(default=None, ge=0, le=100_000)
    # Optional pre-session intention, trimmed and coerced to null when blank.
    intention: Intention = None
    # Optional client idempotency key — a save with a token already seen for this user
    # returns the existing session instead of creating a duplicate (auto-save + manual).
    client_token: str | None = Field(default=None, max_length=64)


class SessionUpdate(BaseModel):
    """All fields optional — only provided fields are changed."""

    model_config = ConfigDict(extra="forbid")

    type: SessionType | None = None
    duration_seconds: int | None = Field(default=None, gt=0, le=86_400)
    occurred_at: OccurredAt | None = None
    notes: str | None = Field(default=None, max_length=2000)
    focus: int | None = Field(default=None, ge=1, le=5)
    calm: int | None = Field(default=None, ge=1, le=5)
    inhale_seconds: int | None = Field(default=None, gt=0, le=BREATH_PHASE_MAX_SECONDS)
    exhale_seconds: int | None = Field(default=None, gt=0, le=BREATH_PHASE_MAX_SECONDS)
    cycles_completed: int | None = Field(default=None, ge=0, le=100_000)
    intention: Intention = None


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

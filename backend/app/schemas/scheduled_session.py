"""Scheduled-session request/response schemas."""

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.session import SessionType


class ScheduledSessionCreate(BaseModel):
    """Plan a future practice."""

    model_config = ConfigDict(extra="forbid")

    type: SessionType
    scheduled_at: datetime
    duration_minutes: int | None = Field(default=None, gt=0, le=600)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("scheduled_at")
    @classmethod
    def _must_be_future(cls, value: datetime) -> datetime:
        """Reject past-dated plans — you can only schedule a session ahead. Naive
        timestamps are interpreted as UTC for the comparison."""
        moment = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        if moment < datetime.now(UTC):
            raise ValueError("scheduled_at must be in the future")
        return value


class ScheduledSessionRead(BaseModel):
    """Safe scheduled-session representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    scheduled_at: datetime
    duration_minutes: int | None
    note: str | None
    created_at: datetime

"""Scheduled-session request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.session import SessionType


class ScheduledSessionCreate(BaseModel):
    """Plan a future practice."""

    type: SessionType
    scheduled_at: datetime
    duration_minutes: int | None = Field(default=None, gt=0, le=600)
    note: str | None = Field(default=None, max_length=200)


class ScheduledSessionRead(BaseModel):
    """Safe scheduled-session representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    scheduled_at: datetime
    duration_minutes: int | None
    note: str | None
    created_at: datetime

"""Mood check-in request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.journal import Mood


class MoodLogCreate(BaseModel):
    """A quick "how do you feel?" check-in — just a mood from the fixed palette."""

    model_config = ConfigDict(extra="forbid")

    mood: Mood


class MoodLogRead(BaseModel):
    """Safe mood-log representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    mood: str
    created_at: datetime

"""Meditation journal request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Mood = Literal[
    "calm",
    "content",
    "focused",
    "energized",
    "grateful",
    "hopeful",
    "excited",
    "peaceful",
    "neutral",
    "restless",
    "anxious",
    "frustrated",
    "overwhelmed",
    "tired",
    "low",
]


class JournalCreate(BaseModel):
    """A new reflection. Optionally tagged with a mood and tied to a session."""

    body: str = Field(min_length=1, max_length=5000)
    mood: Mood | None = None
    session_id: uuid.UUID | None = None


class JournalUpdate(BaseModel):
    """Edit a reflection. Only provided fields change."""

    body: str | None = Field(default=None, min_length=1, max_length=5000)
    mood: Mood | None = None


class JournalRead(BaseModel):
    """Safe journal representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    mood: str | None
    session_id: uuid.UUID | None
    created_at: datetime

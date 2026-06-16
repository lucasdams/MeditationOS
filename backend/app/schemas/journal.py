"""Meditation journal request/response schemas."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas._validators import trimmed_nonblank

# Required reflection text: trimmed, with a whitespace-only body rejected (422) so it
# can't light the journal quest or earn XP. Cap stays at 5000 chars.
JOURNAL_BODY_MAX_LENGTH = 5000
JournalBody = Annotated[str, BeforeValidator(trimmed_nonblank(JOURNAL_BODY_MAX_LENGTH))]

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

    model_config = ConfigDict(extra="forbid")

    body: JournalBody
    mood: Mood | None = None
    session_id: uuid.UUID | None = None


class JournalUpdate(BaseModel):
    """Edit a reflection. Only provided fields change."""

    model_config = ConfigDict(extra="forbid")

    body: JournalBody | None = None
    mood: Mood | None = None


class JournalRead(BaseModel):
    """Safe journal representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    mood: str | None
    session_id: uuid.UUID | None
    created_at: datetime

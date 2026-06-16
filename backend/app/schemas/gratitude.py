"""Gratitude request/response schemas."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas._validators import trimmed_nonblank

# Required gratitude text: trimmed, with a whitespace-only entry rejected (422) so it
# can't light the gratitude quest or earn XP. Cap stays at 500 chars.
GRATITUDE_TEXT_MAX_LENGTH = 500
GratitudeText = Annotated[
    str, BeforeValidator(trimmed_nonblank(GRATITUDE_TEXT_MAX_LENGTH))
]

GratitudeCategory = Literal[
    "people",
    "health",
    "nature",
    "experiences",
    "growth",
    "home",
    "self",
    "simple_pleasures",
    "small_moments",
    "big_moments",
    "spiritual",
    "material",
    "work",
    "food",
    "learning",
    "creativity",
    "kindness",
    "music",
    "animals",
    "travel",
    "friendship",
    "family",
    "love",
    "play",
    "memories",
    "hope",
    "body",
    "mind",
    "mornings",
    "evenings",
    "weather",
    "comfort",
    "freedom",
    "abundance",
    "community",
    "beauty",
    "custom",
]


class GratitudeCreate(BaseModel):
    """A new gratitude moment."""

    model_config = ConfigDict(extra="forbid")

    category: GratitudeCategory
    text: GratitudeText


class GratitudeRead(BaseModel):
    """Safe gratitude representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    text: str
    created_at: datetime


class GratitudeSuggestions(BaseModel):
    """Precise prompt options for a category (AI-generated or curated fallback)."""

    category: GratitudeCategory
    options: list[str]

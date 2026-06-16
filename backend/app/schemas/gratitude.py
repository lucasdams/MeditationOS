"""Gratitude request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
    text: str = Field(min_length=1, max_length=500)


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

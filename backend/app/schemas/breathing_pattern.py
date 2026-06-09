"""Breathing pattern request/response schemas."""

import uuid

from pydantic import BaseModel, ConfigDict, Field, computed_field


class BreathingPatternCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    inhale_seconds: int = Field(ge=1, le=60)
    exhale_seconds: int = Field(ge=1, le=60)


class BreathingPatternRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    inhale_seconds: int
    exhale_seconds: int
    is_preset: bool

    @computed_field
    @property
    def breaths_per_minute(self) -> float:
        return round(60 / (self.inhale_seconds + self.exhale_seconds), 2)

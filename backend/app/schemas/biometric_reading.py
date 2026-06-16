"""Biometric reading request/response schemas.

Values are a personal wellness signal, not a medical measurement — validation
keeps them in a plausible human range but makes no clinical claim.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ReadingContext = Literal["pre", "post", "resting"]
ReadingSource = Literal["manual", "estimated", "camera", "wearable"]


class BiometricReadingCreate(BaseModel):
    # Reject unknown fields so the request shape is strict (→ 422).
    model_config = ConfigDict(extra="forbid")

    context: ReadingContext
    bpm: int = Field(ge=30, le=220)
    hrv_ms: float | None = Field(default=None, ge=0)
    # Defaults to manual; clients may pass `estimated`. camera/wearable arrive later.
    source: ReadingSource = "manual"
    measured_at: datetime
    # Optional link to the sit this reading belongs to (ownership verified server-side).
    session_id: uuid.UUID | None = None


class BiometricReadingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID | None
    context: str
    bpm: int
    hrv_ms: float | None
    source: str
    measured_at: datetime
    created_at: datetime


class BiometricDelta(BaseModel):
    """Average pre→post change around sits, with the sample basis. None when there
    aren't enough paired readings to say anything (framed gently in the UI)."""

    sample_size: int
    avg_bpm_delta: float | None = None
    avg_hrv_ms_delta: float | None = None

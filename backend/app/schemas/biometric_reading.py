"""Biometric reading request/response schemas.

Values are a personal wellness signal, not a medical measurement — validation
keeps them in a plausible human range but makes no clinical claim.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas._validators import reject_implausible_timestamp

ReadingContext = Literal["pre", "post", "resting"]
ReadingSource = Literal["manual", "estimated", "camera", "wearable"]

# A user-set measurement time, clamped to a plausible window (not far-future / far-past)
# so a bogus date can't skew the biometric trend window.
MeasuredAt = Annotated[datetime, AfterValidator(reject_implausible_timestamp)]


class BiometricReadingCreate(BaseModel):
    # Reject unknown fields so the request shape is strict (→ 422).
    model_config = ConfigDict(extra="forbid")

    context: ReadingContext
    bpm: int = Field(ge=30, le=220)
    # Physiological ceiling for RMSSD-style HRV; a wild value would skew the trend.
    hrv_ms: float | None = Field(default=None, ge=0, le=1000)
    # Defaults to manual; clients may pass `estimated`. camera/wearable arrive later.
    source: ReadingSource = "manual"
    measured_at: MeasuredAt
    # Optional link to the sit this reading belongs to (ownership verified server-side).
    session_id: uuid.UUID | None = None
    # Optional client idempotency key — a rapid double-submit of the same reading
    # (e.g. a post reading saved twice) collapses to one row, keeping the pre/post
    # delta deterministic instead of order-dependent.
    client_token: str | None = Field(default=None, max_length=64)


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
    aren't enough paired readings to say anything (framed gently in the UI).

    ``sample_size`` is the number of sessions with both a pre and post BPM reading.
    ``hrv_sample_size`` is the (smaller or equal) subset that also have HRV on both
    ends — kept separate so the UI can be honest about each figure's own basis.
    """

    sample_size: int
    hrv_sample_size: int = 0
    avg_bpm_delta: float | None = None
    avg_hrv_ms_delta: float | None = None

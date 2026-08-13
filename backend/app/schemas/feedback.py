"""In-app feedback request/response schemas.

The write schema is strict (`extra="forbid"`, a fixed category set, a trimmed non-empty
message capped at the model's `MAX_MESSAGE_LENGTH`). The admin read schema carries the
sender's email so the owner can follow up — this is their support inbox, so seeing the
content is intended (unlike the metadata-only admin user/metrics views).
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.feedback import CATEGORIES, MAX_MESSAGE_LENGTH

# Mirror the model's category tuple as a Literal so the API validates (→ 422) against the
# same fixed set the DB check constraint enforces. One source of truth: app.models.feedback.
FeedbackCategory = Literal["bug", "idea", "praise", "other"]

# Guard: keep the Literal in lock-step with the model tuple. A mismatch is a bug we want to
# hear about at import time, not in production.
assert set(CATEGORIES) == set(FeedbackCategory.__args__)  # noqa: S101


class FeedbackCreate(BaseModel):
    """A note sent from inside the app: a coarse category, a message, and (for triage
    context) the route it was sent from."""

    model_config = ConfigDict(extra="forbid")

    category: FeedbackCategory
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    # The app route the note was sent from (e.g. "/breathe"). Optional context, capped so a
    # crafted value can't bloat the row.
    path: str | None = Field(default=None, max_length=255)

    @field_validator("message")
    @classmethod
    def _trim_message(cls, v: str) -> str:
        """Trim surrounding whitespace, then reject an all-whitespace message. Runs after
        Pydantic's length check bounds the raw input, so the trimmed value stays capped."""
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message cannot be empty.")
        return trimmed

    @field_validator("path")
    @classmethod
    def _normalize_path(cls, v: str | None) -> str | None:
        """Trim the path; treat an empty string as absent (null)."""
        if v is None:
            return None
        trimmed = v.strip()
        return trimmed or None


class FeedbackRead(BaseModel):
    """The feedback row echoed back to its sender on create (no email — it's their own)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    message: str
    path: str | None
    created_at: datetime


class AdminFeedbackEntry(BaseModel):
    """One feedback note in the admin inbox: the content plus the sender's email (or null
    if the account was since deleted — the FK is SET NULL)."""

    id: uuid.UUID
    category: str
    message: str
    path: str | None
    created_at: datetime
    email: EmailStr | None


class AdminFeedbackList(BaseModel):
    """A page of feedback notes (newest-first) plus the total count for pagination."""

    entries: list[AdminFeedbackEntry]
    total: int

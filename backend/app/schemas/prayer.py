"""Prayer journal request/response schemas.

Non-denominational by design: a prayer is just free text in `body` (a prayer,
intention, or blessing). Mirrors the meditation journal schema (see
app/schemas/journal.py).
"""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas._validators import trimmed_nonblank

# Required prayer text: trimmed, with a whitespace-only body rejected (422) so it
# can't be stored or earn XP. Cap mirrors the journal body (5000 chars).
PRAYER_BODY_MAX_LENGTH = 5000
PrayerBody = Annotated[str, BeforeValidator(trimmed_nonblank(PRAYER_BODY_MAX_LENGTH))]


class PrayerCreate(BaseModel):
    """A new prayer, intention, or blessing."""

    model_config = ConfigDict(extra="forbid")

    body: PrayerBody


class PrayerUpdate(BaseModel):
    """Edit a prayer. Only provided fields change.

    `answered=True` marks the prayer answered (stamps `answered_at` = now);
    `answered=False` clears it (back to open). Omitting `answered` leaves it as-is.
    """

    model_config = ConfigDict(extra="forbid")

    body: PrayerBody | None = None
    answered: bool | None = None


class PrayerRead(BaseModel):
    """Safe prayer representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    answered_at: datetime | None
    created_at: datetime

"""User request/response schemas.

`password_hash` is never exposed — the read schema only surfaces safe fields.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class UserCreate(BaseModel):
    """Registration input."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    """Login input."""

    email: EmailStr
    password: str


class UsernameUpdate(BaseModel):
    """Set / change the public username."""

    username: str = Field(min_length=3, max_length=20, pattern=r"^[a-zA-Z0-9_]+$")


class GoogleLogin(BaseModel):
    """Sign in with Google — the ID token (JWT) from Google Identity Services."""

    credential: str = Field(min_length=1)


class TimezoneUpdate(BaseModel):
    """Set the user's IANA timezone (e.g. "Asia/Tokyo")."""

    timezone: str = Field(min_length=1, max_length=64)


class PasswordUpdate(BaseModel):
    """Change or set the account password.

    `current_password` is required for accounts that already have one; it is
    omitted when a Google-only account is setting a password for the first time.
    """

    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=128)


class ReminderUpdate(BaseModel):
    """Enable/disable the daily practice reminder and set its local hour (0–23)."""

    enabled: bool
    hour: int | None = Field(default=None, ge=0, le=23)

    @model_validator(mode="after")
    def _hour_required_when_enabled(self) -> "ReminderUpdate":
        if self.enabled and self.hour is None:
            raise ValueError("hour is required when enabled is true")
        return self


class UserRead(BaseModel):
    """Safe user representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    username: str | None
    timezone: str
    has_password: bool
    reminder_enabled: bool
    reminder_hour: int | None
    created_at: datetime

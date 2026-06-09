"""User request/response schemas.

`password_hash` is never exposed — the read schema only surfaces safe fields.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class UserRead(BaseModel):
    """Safe user representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    username: str | None
    created_at: datetime

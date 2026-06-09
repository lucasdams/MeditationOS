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


class UserRead(BaseModel):
    """Safe user representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    created_at: datetime

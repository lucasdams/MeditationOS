"""Admin user-management response schemas.

ACCOUNT METADATA ONLY: id, email/username, account flags, timestamps, and per-user row
COUNTS. By construction these schemas have no field for journal/gratitude/mood body text
or biometric values — the same private-content no-leak guarantee as the admin metrics.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class AdminUserSummary(BaseModel):
    """A user row in the admin search/list — metadata only, no content."""

    id: uuid.UUID
    email: EmailStr
    username: str | None
    created_at: datetime
    email_verified: bool
    is_guest: bool
    is_admin: bool  # derived from the ADMIN_EMAILS allowlist
    is_disabled: bool


class AdminUserCounts(BaseModel):
    """Per-user counts of owned rows — counts only, never any body text."""

    sessions: int
    journals: int
    gratitude: int
    mood_logs: int
    goals: int


class AdminUserDetail(AdminUserSummary):
    """One user's account summary: metadata + last-activity + per-user counts."""

    last_active_at: datetime | None  # most recent session occurrence, or null
    counts: AdminUserCounts


class AdminUserList(BaseModel):
    """A page of user summaries plus the total match count (for pagination)."""

    users: list[AdminUserSummary]
    total: int

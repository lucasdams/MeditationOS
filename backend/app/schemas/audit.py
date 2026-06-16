"""Audit-log response schemas.

The trail records WHO (actor) did WHAT (action) to WHOM (optional target) and WHEN, with
structured non-sensitive `detail` (ids/flags/state) — never private user content.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEntry(BaseModel):
    """One audit-log row. actor/target ids may be null if that account was later
    deleted (the FKs are SET NULL so the trail survives)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    target_user_id: uuid.UUID | None
    action: str
    detail: dict[str, Any] | None
    created_at: datetime


class AuditList(BaseModel):
    """A page of audit entries (newest-first) plus the total count."""

    entries: list[AuditEntry]
    total: int

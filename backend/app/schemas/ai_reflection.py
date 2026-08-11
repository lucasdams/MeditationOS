"""AI reflection response schemas.

The stored `model` column (a model id, or "fallback") is collapsed to a two-value
`source` for clients — the UI only needs to know whether this came from the model
or the curated pool, never which model id produced it.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.ai_reflection import AIReflection
from app.services.ai.reflection_coach import FALLBACK_MODEL


class AIReflectionRead(BaseModel):
    """Safe reflection representation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    journal_id: uuid.UUID
    reflection_text: str
    followup_question: str
    source: Literal["ai", "fallback"]
    created_at: datetime

    @classmethod
    def from_row(cls, row: AIReflection) -> "AIReflectionRead":
        return cls(
            id=row.id,
            journal_id=row.journal_id,
            reflection_text=row.reflection_text,
            followup_question=row.followup_question,
            source="fallback" if row.model == FALLBACK_MODEL else "ai",
            created_at=row.created_at,
        )

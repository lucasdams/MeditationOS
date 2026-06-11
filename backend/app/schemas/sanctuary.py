"""Sanctuary response schemas. See docs/design/sanctuary.md.

Phase 2: the scene is the user's ordered cultivation sequence. Each planting's stage,
progress, and completion are computed from cumulative practice; the ASCII art for each
(item_key, stage) lives on the frontend (`lib/sanctuaryArt.ts`) — the backend owns
*growth*, the frontend owns *rendering*.
"""

from pydantic import BaseModel


class PlantState(BaseModel):
    item_key: str
    track: str
    position: int  # order in the sequence
    stage: int  # 0 .. stage_count - 1
    stage_count: int
    progress: float  # 0.0 .. 1.0
    complete: bool


class CatalogOption(BaseModel):
    """An item the user may choose to grow next (already unlocked)."""

    item_key: str
    track: str


class SanctuaryScene(BaseModel):
    plantings: list[PlantState]  # the whole garden, ordered
    current_position: int | None  # the actively growing planting; None if all complete
    next_options: list[CatalogOption]  # offered only when ready to plant next


class PlantRequest(BaseModel):
    item_key: str

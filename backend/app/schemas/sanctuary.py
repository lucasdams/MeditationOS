"""Sanctuary response schemas. See docs/design/sanctuary.md.

The scene is the user's ordered cultivation sequence. Each planting's stage, progress,
and completion — plus the garden's vitality and which items are unlocked — are computed
on read; the ASCII art for each (item_key, stage) lives on the frontend
(`lib/sanctuaryArt.ts`). The backend owns *growth*, the frontend owns *rendering*.
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
    """An item the user may choose to grow next. Locked items are still listed (so the
    UI can show them with their requirement), but only `unlocked` ones can be planted."""

    item_key: str
    track: str
    unlocked: bool
    hint: str | None  # what's needed to unlock it (None when already unlocked)


class SanctuaryScene(BaseModel):
    plantings: list[PlantState]  # the whole garden, ordered
    current_position: int | None  # the actively growing planting; None if all complete
    next_options: list[CatalogOption]  # offered only when ready to plant next
    vitality: str  # "dormant" | "thriving" | "flourishing" — from the current streak
    current_streak: int


class PlantRequest(BaseModel):
    item_key: str

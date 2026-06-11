"""Sanctuary response schemas. See docs/design/sanctuary.md.

Phase 1 is read-only: the scene is the single starter plant, growing from practice.
The ASCII art for each (item_key, stage) lives on the frontend (`lib/sanctuaryArt.ts`),
mirroring how the level tree's art lives in `lib/tree.ts` — the backend is the source
of truth for *growth*, the frontend for *rendering*.
"""

from pydantic import BaseModel


class PlantState(BaseModel):
    item_key: str
    track: str
    stage: int  # 0 .. stage_count - 1
    stage_count: int
    progress: float  # 0.0 .. 1.0


class SanctuaryScene(BaseModel):
    current: PlantState
    completed: list[PlantState] = []

"""Sanctuary cultivation logic — Phase 1 (read-only starter plant).

The garden the user grows by practicing. Phase 1 has a single implicit starter plant
(no `sanctuary_plantings` table yet): its growth is computed from cumulative practice,
on the same activity that earns XP (resonance breathing counts 3×). Nothing is stored —
see docs/design/sanctuary.md and ADR-0010.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.session import Session
from app.schemas.sanctuary import PlantState, SanctuaryScene
from app.services.dashboard_service import BREATHING_XP_MULTIPLIER


@dataclass(frozen=True)
class CatalogItem:
    key: str
    track: str
    grow_cost: int  # practice points to fully grow
    stage_count: int  # number of visual growth stages (0 .. stage_count - 1)


# In-code catalog — the single source of truth for what can be grown. Phase 1 ships
# the starter tree only; later phases add flowers, structures, and companions, each
# with its own grow_cost and unlock condition (see the design doc).
SANCTUARY_CATALOG: dict[str, CatalogItem] = {
    "tree": CatalogItem(key="tree", track="nature", grow_cost=60, stage_count=5),
}

STARTER_KEY = "tree"


def _practice_points(db: DBSession, user_id: uuid.UUID) -> int:
    """Cumulative practice points: minutes practiced, resonance breathing ×3.

    Mirrors the practice portion of the XP formula in `dashboard_service`, so the
    garden grows on exactly the activity that earns XP.
    """
    total_seconds = db.execute(
        select(func.coalesce(func.sum(Session.duration_seconds), 0)).where(
            Session.user_id == user_id
        )
    ).scalar_one()
    breathing_seconds = db.execute(
        select(func.coalesce(func.sum(Session.duration_seconds), 0)).where(
            Session.user_id == user_id,
            Session.type == "resonance_breathing",
        )
    ).scalar_one()
    non_breathing_minutes = (int(total_seconds) - int(breathing_seconds)) // 60
    breathing_minutes = int(breathing_seconds) // 60
    return non_breathing_minutes + breathing_minutes * BREATHING_XP_MULTIPLIER


def _plant_state(item: CatalogItem, points: int) -> PlantState:
    progress = min(1.0, points / item.grow_cost) if item.grow_cost > 0 else 1.0
    # Map progress into a discrete stage; clamp so progress == 1.0 lands on the last.
    stage = min(item.stage_count - 1, int(progress * item.stage_count))
    return PlantState(
        item_key=item.key,
        track=item.track,
        stage=stage,
        stage_count=item.stage_count,
        progress=round(progress, 4),
    )


def get_scene(db: DBSession, user_id: uuid.UUID) -> SanctuaryScene:
    """The user's sanctuary. Phase 1: the single starter plant, grown from practice."""
    points = _practice_points(db, user_id)
    current = _plant_state(SANCTUARY_CATALOG[STARTER_KEY], points)
    return SanctuaryScene(current=current, completed=[])

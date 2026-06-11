"""Sanctuary cultivation logic — Phase 2 (the plant-next loop).

The garden the user grows by practicing. The only stored state is the ordered list of
chosen items (`sanctuary_plantings`); everything else — each item's growth stage,
completion, the current growing item, and which items are unlocked — is computed on
read from cumulative practice (resonance breathing counts 3×, the XP unit). Growth
thresholds *stack* across the sequence, so practice carries over and nothing is wasted.
See docs/design/sanctuary.md and ADR-0010.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.sanctuary import SanctuaryPlanting
from app.models.session import Session
from app.schemas.sanctuary import CatalogOption, PlantState, SanctuaryScene
from app.services.dashboard_service import BREATHING_XP_MULTIPLIER


@dataclass(frozen=True)
class CatalogItem:
    key: str
    track: str
    grow_cost: int  # practice points to fully grow
    stage_count: int  # visual growth stages (0 .. stage_count - 1)
    unlock_points: int = 0  # lifetime practice points before it's offered (0 = always)


# In-code catalog — the single source of truth for what can be grown (a nature track
# for Phase 2). Later phases add more tracks (structures, companions) and richer unlocks.
SANCTUARY_CATALOG: dict[str, CatalogItem] = {
    "tree": CatalogItem("tree", "nature", grow_cost=60, stage_count=5, unlock_points=0),
    "flower": CatalogItem("flower", "nature", grow_cost=30, stage_count=4, unlock_points=0),
    "pond": CatalogItem("pond", "nature", grow_cost=120, stage_count=3, unlock_points=100),
}

STARTER_KEY = "tree"


class SanctuaryError(Exception):
    """Base for sanctuary domain errors (mapped to HTTP in the route)."""


class UnknownItem(SanctuaryError):
    """The requested item_key is not in the catalog."""


class CurrentStillGrowing(SanctuaryError):
    """Can't plant the next item while the current one is still growing."""


class ItemLocked(SanctuaryError):
    """The requested item hasn't been unlocked yet."""


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


def _load(db: DBSession, user_id: uuid.UUID) -> list[SanctuaryPlanting]:
    """Plantings ordered by position, seeding the starter if the garden is empty."""
    stmt = (
        select(SanctuaryPlanting)
        .where(SanctuaryPlanting.user_id == user_id)
        .order_by(SanctuaryPlanting.position)
    )
    rows = list(db.execute(stmt).scalars().all())
    if not rows:
        starter = SanctuaryPlanting(user_id=user_id, item_key=STARTER_KEY, position=0)
        db.add(starter)
        db.commit()
        rows = [starter]
    return rows


def _build_scene(plantings: list[SanctuaryPlanting], points: int) -> SanctuaryScene:
    """Compute each planting's growth + the current item + next-options from `points`.

    Thresholds stack: planting i is complete once cumulative practice reaches the sum
    of grow_costs up to and including it. The current item is the first incomplete one;
    when every planting is complete the user may plant the next (any unlocked item).
    """
    cumulative = 0
    states: list[PlantState] = []
    current_position: int | None = None
    for p in plantings:
        item = SANCTUARY_CATALOG[p.item_key]
        start = cumulative
        cumulative += item.grow_cost
        into = points - start
        progress = max(0.0, min(1.0, into / item.grow_cost)) if item.grow_cost > 0 else 1.0
        complete = points >= cumulative
        stage = min(item.stage_count - 1, int(progress * item.stage_count))
        states.append(
            PlantState(
                item_key=item.key,
                track=item.track,
                position=p.position,
                stage=stage,
                stage_count=item.stage_count,
                progress=round(progress, 4),
                complete=complete,
            )
        )
        if not complete and current_position is None:
            current_position = p.position

    next_options: list[CatalogOption] = []
    if current_position is None:  # the whole sequence is grown — ready to plant next
        next_options = [
            CatalogOption(item_key=item.key, track=item.track)
            for item in SANCTUARY_CATALOG.values()
            if item.unlock_points <= points
        ]
    return SanctuaryScene(
        plantings=states, current_position=current_position, next_options=next_options
    )


def get_scene(db: DBSession, user_id: uuid.UUID) -> SanctuaryScene:
    """The user's sanctuary: the growing assortment, computed from practice."""
    plantings = _load(db, user_id)
    return _build_scene(plantings, _practice_points(db, user_id))


def plant_next(db: DBSession, user_id: uuid.UUID, item_key: str) -> SanctuaryScene:
    """Append the next item to grow. Requires the item unlocked and the current done."""
    if item_key not in SANCTUARY_CATALOG:
        raise UnknownItem(item_key)
    plantings = _load(db, user_id)
    points = _practice_points(db, user_id)
    scene = _build_scene(plantings, points)
    if scene.current_position is not None:
        raise CurrentStillGrowing()
    if SANCTUARY_CATALOG[item_key].unlock_points > points:
        raise ItemLocked(item_key)
    # UNIQUE(user_id, position) backstops a double-plant race.
    db.add(SanctuaryPlanting(user_id=user_id, item_key=item_key, position=len(plantings)))
    db.commit()
    return get_scene(db, user_id)

"""Sanctuary cultivation logic — the plant-next loop with tracks, unlocks, vitality.

The garden the user grows by practicing. The only stored state is the ordered list of
chosen plantings (`sanctuary_plantings`); everything else — each item's growth stage,
completion, the current growing item, which items are unlocked, and the garden's
vitality — is computed on read from cumulative practice (resonance breathing ×3, the XP
unit) and the current streak. Growth thresholds *stack* across the sequence, so practice
carries over and nothing is wasted. See docs/design/sanctuary.md and ADR-0010.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.sanctuary import SanctuaryPlanting
from app.models.session import Session
from app.schemas.sanctuary import CatalogOption, PlantState, SanctuaryScene
from app.services.dashboard_service import (
    BREATHING_XP_MULTIPLIER,
    _compute_streaks,
    _local_date,
)


@dataclass(frozen=True)
class CatalogItem:
    key: str
    track: str  # "nature" | "structure" | "companion"
    grow_cost: int  # practice points to fully grow
    stage_count: int  # visual growth stages (0 .. stage_count - 1)
    unlock_points: int = 0  # lifetime practice points required before it's offered
    unlock_streak: int = 0  # current-streak days required before it's offered


# In-code catalog — the single source of truth for what can be grown, across a few
# tracks. Unlocks are milestones: lifetime practice points and/or a current streak.
SANCTUARY_CATALOG: dict[str, CatalogItem] = {
    # Nature
    "tree": CatalogItem("tree", "nature", grow_cost=60, stage_count=5),
    "flower": CatalogItem("flower", "nature", grow_cost=30, stage_count=4),
    "pond": CatalogItem("pond", "nature", grow_cost=120, stage_count=3, unlock_points=100),
    # Structures
    "hut": CatalogItem("hut", "structure", grow_cost=90, stage_count=3, unlock_points=60),
    "cottage": CatalogItem("cottage", "structure", grow_cost=110, stage_count=3, unlock_points=120),
    "barn": CatalogItem("barn", "structure", grow_cost=150, stage_count=3, unlock_points=150),
    "car": CatalogItem("car", "structure", grow_cost=160, stage_count=3, unlock_points=200),
    "beach_house": CatalogItem("beach_house", "structure", grow_cost=180, stage_count=3, unlock_points=250),
    "boat": CatalogItem("boat", "structure", grow_cost=220, stage_count=3, unlock_points=350),
    # Companions
    "goldfish": CatalogItem("goldfish", "companion", grow_cost=35, stage_count=3, unlock_points=30),
    "bird": CatalogItem("bird", "companion", grow_cost=40, stage_count=3, unlock_points=50),
    "cat": CatalogItem("cat", "companion", grow_cost=60, stage_count=3, unlock_points=80),
    "snake": CatalogItem("snake", "companion", grow_cost=70, stage_count=3, unlock_points=120),
    "fox": CatalogItem("fox", "companion", grow_cost=80, stage_count=3, unlock_streak=3),
    "dog": CatalogItem("dog", "companion", grow_cost=100, stage_count=3, unlock_streak=7),
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


def _current_streak(db: DBSession, user_id: uuid.UUID, today: date, tz: str) -> int:
    """The user's current streak (local-day bucketed), reusing the dashboard engine."""
    rows = db.execute(
        select(_local_date(tz, Session.occurred_at))
        .where(Session.user_id == user_id)
        .distinct()
    ).all()
    current, _longest, _rest = _compute_streaks({r[0] for r in rows}, today)
    return current


def _vitality(streak: int) -> str:
    """Visual-only health of the garden — never destructive (owned plants persist)."""
    if streak == 0:
        return "dormant"
    if streak >= 7:
        return "flourishing"
    return "thriving"


def _unlock_hint(item: CatalogItem, points: int, streak: int) -> str | None:
    """What's still needed to unlock `item`, or None if it's already unlocked."""
    needs = []
    if item.unlock_points > points:
        needs.append(f"{item.unlock_points} practice points")
    if item.unlock_streak > streak:
        needs.append(f"a {item.unlock_streak}-day streak")
    if not needs:
        return None
    return "Needs " + " and ".join(needs)


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


def _build_scene(
    plantings: list[SanctuaryPlanting], points: int, streak: int
) -> SanctuaryScene:
    """Compute each planting's growth, the current item, vitality, and next-options.

    Thresholds stack: planting i is complete once cumulative practice reaches the sum
    of grow_costs up to and including it. The current item is the first incomplete one;
    when every planting is complete the user may plant the next item.
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
        # List every catalog item (locked ones too, with a hint) so the UI can motivate.
        next_options = [
            CatalogOption(
                item_key=item.key,
                track=item.track,
                unlocked=item.unlock_points <= points and item.unlock_streak <= streak,
                hint=_unlock_hint(item, points, streak),
            )
            for item in SANCTUARY_CATALOG.values()
        ]
    return SanctuaryScene(
        plantings=states,
        current_position=current_position,
        next_options=next_options,
        vitality=_vitality(streak),
        current_streak=streak,
    )


def get_scene(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC"
) -> SanctuaryScene:
    """The user's sanctuary: the growing assortment, computed from practice + streak."""
    plantings = _load(db, user_id)
    points = _practice_points(db, user_id)
    streak = _current_streak(db, user_id, today, tz)
    return _build_scene(plantings, points, streak)


def plant_next(
    db: DBSession, user_id: uuid.UUID, item_key: str, *, today: date, tz: str = "UTC"
) -> SanctuaryScene:
    """Append the next item to grow. Requires the item unlocked and the current done."""
    if item_key not in SANCTUARY_CATALOG:
        raise UnknownItem(item_key)
    plantings = _load(db, user_id)
    points = _practice_points(db, user_id)
    streak = _current_streak(db, user_id, today, tz)
    scene = _build_scene(plantings, points, streak)
    if scene.current_position is not None:
        raise CurrentStillGrowing()
    item = SANCTUARY_CATALOG[item_key]
    if item.unlock_points > points or item.unlock_streak > streak:
        raise ItemLocked(item_key)
    # UNIQUE(user_id, position) backstops a double-plant race.
    db.add(SanctuaryPlanting(user_id=user_id, item_key=item_key, position=len(plantings)))
    db.commit()
    return get_scene(db, user_id, today=today, tz=tz)

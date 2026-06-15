"""Sanctuary spend economy — earn coins by levelling up, spend them to buy and upgrade
items. See docs/design/sanctuary.md and ADR-0011 (supersedes ADR-0010's cultivation).

Stored state is only *what you own* and each item's `tier`. The coin balance is computed
on read: coins earned from levels (a level computed from **earned XP** — total XP minus
the volatile streak bonus, so coins never decrease) minus coins spent on owned items.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.sanctuary import SanctuaryPlanting
from app.schemas.sanctuary import BuyRequest, OwnedItem, SanctuaryScene, ShopItem
from app.services import dashboard_service

# Coins granted per level reached. The garden is paced against this (see catalog costs).
COINS_PER_LEVEL = 50


@dataclass(frozen=True)
class CatalogItem:
    key: str
    track: str  # "nature" | "structure" | "companion"
    cost: int  # coins to buy (tier 0)
    unlock_level: int = 1  # min level before it appears in the shop
    upgrade_costs: tuple[int, ...] = ()  # coins to reach tier 1, 2, …

    @property
    def max_tier(self) -> int:
        return len(self.upgrade_costs)

    def spent_at(self, tier: int) -> int:
        """Coins sunk into one of these owned at `tier` — the buy cost plus each upgrade."""
        return self.cost + sum(self.upgrade_costs[: max(0, tier)])

    def next_upgrade_cost(self, tier: int) -> int | None:
        return self.upgrade_costs[tier] if 0 <= tier < self.max_tier else None


def _item(key: str, track: str, cost: int, unlock_level: int = 1) -> CatalogItem:
    """Two upgrade tiers per item, priced off the buy cost (×1.5 then ×3)."""
    return CatalogItem(
        key=key,
        track=track,
        cost=cost,
        unlock_level=unlock_level,
        upgrade_costs=(round(cost * 1.5), round(cost * 3)),
    )


# In-code catalog — the single source of truth for what's buyable and what it costs.
SANCTUARY_CATALOG: dict[str, CatalogItem] = {
    # Nature
    "tree": _item("tree", "nature", 40),
    "flower": _item("flower", "nature", 25),
    "pond": _item("pond", "nature", 80, unlock_level=4),
    # Structures
    "hut": _item("hut", "structure", 60, unlock_level=2),
    "cottage": _item("cottage", "structure", 90, unlock_level=3),
    "barn": _item("barn", "structure", 120, unlock_level=4),
    "car": _item("car", "structure", 130, unlock_level=5),
    "beach_house": _item("beach_house", "structure", 150, unlock_level=6),
    "boat": _item("boat", "structure", 170, unlock_level=8),
    # Companions
    "goldfish": _item("goldfish", "companion", 30),
    "bird": _item("bird", "companion", 35, unlock_level=2),
    "cat": _item("cat", "companion", 50, unlock_level=3),
    "snake": _item("snake", "companion", 60, unlock_level=4),
    "fox": _item("fox", "companion", 70, unlock_level=5),
    "dog": _item("dog", "companion", 90, unlock_level=6),
}


class UnknownItem(Exception):
    """The requested item_key is not in the catalog."""


class ItemLocked(Exception):
    """The item's level requirement isn't met yet."""


class InsufficientCoins(Exception):
    """Not enough coins for this purchase/upgrade."""


class MaxTier(Exception):
    """The item is already at its highest tier."""


def _vitality(streak: int) -> str:
    """Visual-only health of the garden — never destructive (owned items persist)."""
    if streak == 0:
        return "dormant"
    if streak >= 7:
        return "flourishing"
    return "thriving"


def _wallet(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> tuple[int, int, int]:
    """(coins_earned, level, current_streak). Coins come from a level computed on *earned*
    XP (total XP minus the streak bonus), so the balance never drops when a streak lapses.
    """
    stats = dashboard_service.get_stats(db, user_id, today=today, tz=tz)
    earned_xp = max(0, stats.xp - stats.streak_bonus_xp)
    level, _into, _next = dashboard_service._level_progress(earned_xp)
    return level * COINS_PER_LEVEL, level, stats.current_streak_days


def _load(db: DBSession, user_id: uuid.UUID) -> list[SanctuaryPlanting]:
    stmt = (
        select(SanctuaryPlanting)
        .where(SanctuaryPlanting.user_id == user_id)
        .order_by(SanctuaryPlanting.position)
    )
    return list(db.execute(stmt).scalars().all())


def _spent(plantings: list[SanctuaryPlanting]) -> int:
    total = 0
    for p in plantings:
        item = SANCTUARY_CATALOG.get(p.item_key)
        if item is not None:
            total += item.spent_at(p.tier)
    return total


def _build_scene(
    plantings: list[SanctuaryPlanting], coins_earned: int, level: int, streak: int
) -> SanctuaryScene:
    balance = coins_earned - _spent(plantings)
    owned: list[OwnedItem] = []
    for p in plantings:
        item = SANCTUARY_CATALOG.get(p.item_key)
        if item is None:
            continue
        owned.append(
            OwnedItem(
                id=str(p.id),
                item_key=p.item_key,
                track=item.track,
                position=p.position,
                tier=p.tier,
                max_tier=item.max_tier,
                next_upgrade_cost=item.next_upgrade_cost(p.tier),
            )
        )
    shop = [
        ShopItem(
            item_key=item.key,
            track=item.track,
            cost=item.cost,
            unlocked=level >= item.unlock_level,
            hint=None if level >= item.unlock_level else f"Reach level {item.unlock_level}",
        )
        for item in SANCTUARY_CATALOG.values()
    ]
    return SanctuaryScene(
        coins=max(0, balance),
        level=level,
        owned=owned,
        shop=shop,
        vitality=_vitality(streak),
        current_streak=streak,
    )


def get_scene(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC"
) -> SanctuaryScene:
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    return _build_scene(_load(db, user_id), coins_earned, level, streak)


def buy(
    db: DBSession, user_id: uuid.UUID, data: BuyRequest, *, today: date, tz: str = "UTC"
) -> SanctuaryScene:
    """Buy a catalog item (a fresh tier-0 instance). Validates: known, unlocked by level,
    and affordable."""
    item = SANCTUARY_CATALOG.get(data.item_key)
    if item is None:
        raise UnknownItem(data.item_key)
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    if level < item.unlock_level:
        raise ItemLocked(data.item_key)
    plantings = _load(db, user_id)
    if coins_earned - _spent(plantings) < item.cost:
        raise InsufficientCoins(data.item_key)
    next_position = (max((p.position for p in plantings), default=-1)) + 1
    db.add(
        SanctuaryPlanting(
            user_id=user_id, item_key=item.key, position=next_position, tier=0
        )
    )
    db.commit()
    return _build_scene(_load(db, user_id), coins_earned, level, streak)


def upgrade(
    db: DBSession, user_id: uuid.UUID, planting_id: uuid.UUID, *, today: date, tz: str = "UTC"
) -> SanctuaryScene | None:
    """Upgrade an owned item one tier. None if not the caller's; raises on max-tier or
    insufficient coins."""
    row = db.execute(
        select(SanctuaryPlanting).where(
            SanctuaryPlanting.id == planting_id, SanctuaryPlanting.user_id == user_id
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    item = SANCTUARY_CATALOG.get(row.item_key)
    if item is None or row.tier >= item.max_tier:
        raise MaxTier(row.item_key)
    cost = item.upgrade_costs[row.tier]
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    plantings = _load(db, user_id)
    if coins_earned - _spent(plantings) < cost:
        raise InsufficientCoins(row.item_key)
    row.tier += 1
    db.commit()
    return _build_scene(_load(db, user_id), coins_earned, level, streak)

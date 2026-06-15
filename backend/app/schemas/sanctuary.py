"""Sanctuary response schemas. See docs/design/sanctuary.md and ADR-0011.

The sanctuary is a small spend economy: you earn **coins** as you level up (computed
from earned XP) and spend them to **buy** items or **upgrade** them through visual tiers.
What you own (and each item's tier) is the only stored state; the balance is computed
on read as coins earned − coins spent.
"""

from pydantic import BaseModel


class OwnedItem(BaseModel):
    id: str  # the planting row id (for upgrade requests)
    item_key: str
    track: str
    position: int  # display order
    tier: int  # 0 = base; each upgrade bumps it
    max_tier: int  # highest tier available for this item
    next_upgrade_cost: int | None  # coins to upgrade once more; None if maxed


class ShopItem(BaseModel):
    """A catalog item you can buy. Locked items are listed with a hint (level needed)."""

    item_key: str
    track: str
    cost: int  # coins to buy (tier 0)
    unlocked: bool  # level requirement met
    hint: str | None  # what's needed to unlock (None when unlocked)


class SanctuaryScene(BaseModel):
    coins: int  # spendable balance (earned − spent)
    level: int  # the user's level (coins accrue as it rises)
    owned: list[OwnedItem]  # the garden, in display order
    shop: list[ShopItem]  # everything buyable, with unlock state
    vitality: str  # "dormant" | "thriving" | "flourishing" — from the current streak
    current_streak: int


class BuyRequest(BaseModel):
    item_key: str

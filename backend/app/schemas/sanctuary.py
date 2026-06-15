"""Sanctuary response/request schemas. See docs/design/sanctuary.md, ADR-0011 (derived
balance) and ADR-0012 (variants + mix-and-match customizations).

The sanctuary is a small spend economy: you earn **coins** as you level up (computed from
earned XP) and spend them to **buy** items (picking a **variant**) and apply
**customizations** (independent named options bought over time). What you own — each
item's variant and its customizations — is the only stored state; the balance is computed
on read as coins earned − coins spent. Each request model forbids unexpected fields.
"""

from pydantic import BaseModel, ConfigDict


class SlotOption(BaseModel):
    """One option inside a customization slot, with its cost and current state."""

    option: str
    cost: int  # coins to apply this option
    unlocked: bool  # level requirement met
    unlock_hint: str | None  # what's needed to unlock (None when unlocked)
    affordable: bool  # the current balance covers the cost
    applied: bool  # this option is the one currently on the item


class AvailableSlot(BaseModel):
    """A customization axis for an owned item: the options to mix and match."""

    slot: str
    applied: str | None  # the option currently applied in this slot (None if none)
    options: list[SlotOption]


class OwnedItem(BaseModel):
    id: str  # the planting row id (for customize requests)
    item_key: str
    track: str
    position: int  # display order
    variant: str | None  # the chosen base form (the item's default when it has variants)
    customizations: dict[str, str]  # {slot: option} of what's purchased
    available: list[AvailableSlot]  # slots/options that can still be applied, with hints


class VariantOption(BaseModel):
    """A base form selectable at purchase time."""

    variant: str
    cost_delta: int  # extra coins over the buy cost (0 = free)
    unlocked: bool  # level requirement met
    unlock_hint: str | None  # what's needed to unlock (None when unlocked)


class ShopItem(BaseModel):
    """A catalog item you can buy. Locked items are listed with a hint (level needed)."""

    item_key: str
    track: str
    cost: int  # coins to buy (default variant, no customizations)
    unlocked: bool  # level requirement met
    hint: str | None  # what's needed to unlock (None when unlocked)
    variants: list[VariantOption]  # selectable base forms (empty for fixed-form items)


class SanctuaryScene(BaseModel):
    coins: int  # spendable balance (earned − spent)
    level: int  # the user's level (coins accrue as it rises)
    owned: list[OwnedItem]  # the garden, in display order
    shop: list[ShopItem]  # everything buyable, with unlock state
    vitality: str  # "dormant" | "thriving" | "flourishing" — from the current streak
    current_streak: int


class BuyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_key: str
    variant: str | None = None  # chosen base form; None = the item's default


class CustomizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: str
    option: str

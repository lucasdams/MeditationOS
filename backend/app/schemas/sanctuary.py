"""Sanctuary response/request schemas. See docs/design/sanctuary.md, ADR-0011 (derived
balance) and ADR-0012 (variants + mix-and-match customizations).

The sanctuary is a small spend economy: you earn **coins** as you level up (computed from
earned XP) and spend them to **buy** items (picking a **variant**) and apply
**customizations** (independent named options bought over time). What you own — each
item's variant and its customizations — is the only stored state; the balance is computed
on read as coins earned − coins spent. Each request model forbids unexpected fields.
"""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.schemas._validators import _capped_blank_to_none

# Length caps for the optional cosmetic text touches (ADR-0015). A name is a short plaque;
# a note is a one-line caption. Over-length input is rejected as 422 (enforced server-side
# regardless of any client cap).
NAME_MAX_LENGTH = 40
NOTE_MAX_LENGTH = 140


# A trimmed, length-capped optional name. Empty/whitespace → None (clears the plaque);
# over-length → 422.
SanctuaryName = Annotated[
    str | None, BeforeValidator(_capped_blank_to_none(NAME_MAX_LENGTH))
]
# A trimmed, length-capped optional free-text note/caption. Empty/whitespace → None.
SanctuaryNote = Annotated[
    str | None, BeforeValidator(_capped_blank_to_none(NOTE_MAX_LENGTH))
]


class SlotOption(BaseModel):
    """One option inside a customization slot, with its cost and current state."""

    option: str
    cost: int  # coins to apply this option
    unlocked: bool  # level requirement met
    unlock_hint: str | None  # what's needed to unlock (None when unlocked)
    affordable: bool  # the current balance covers the cost
    applied: bool  # this option is the one currently on the item
    # A growth rung already REACHED via practice, not coins (Tended oak only — see
    # docs/design/sanctuary-upgrades-tended.md). True on each `grown` rung at or below the
    # oak's Tending-earned stage: practice already displays it, so it's not a buyable purchase
    # (the UI renders it like an applied/done rung, never a buy button). Always False for every
    # non-oak item and every non-`grown` slot — the coin path there is exactly as before.
    reached: bool = False


class AvailableSlot(BaseModel):
    """A customization axis for an owned item: the options to mix and match."""

    slot: str
    applied: str | None  # the option currently applied in this slot (None if none)
    options: list[SlotOption]


class TendingStatus(BaseModel):
    """The "Tended" growth state of an item whose stage is driven by practice, not coins
    (see docs/design/sanctuary-upgrades-tended.md). Present only on items that participate in
    Tending (the oak, in the MVP); None otherwise. Purely informational — the displayed stage
    is already merged into `customizations.grown`, so the renderer needs no special-casing."""

    tending: int  # the user's monotonic Tending score `T`
    practice_days: int  # distinct practice days behind `T` (for the "Tended by N days" meter)
    stage: str | None  # the currently-displayed growth stage key (None = un-grown base)
    next_stage: str | None  # the next growth stage key, if any (None at the top of the ladder)
    next_threshold: int | None  # Tending score that unlocks the next stage (None at the top)


class OwnedItem(BaseModel):
    id: str  # the planting row id (for customize / move requests)
    item_key: str
    track: str
    position: int  # immutable acquisition order (economy key — NOT the grid layout)
    cell: int  # grid layout slot (row-major index); the user rearranges this freely
    variant: str | None  # the chosen base form (the item's default when it has variants)
    customizations: dict[str, str]  # {slot: option} of what's purchased
    available: list[AvailableSlot]  # slots/options that can still be applied, with hints
    # Optional cosmetic personalization (ADR-0015) — all default-off, never affect coins.
    name: str | None  # user-chosen plaque/nickname (None = unnamed)
    note: str | None  # short free-text caption/memory (None = none)
    favorite: bool  # pinned/favourited (subtle star); default False
    # "Tended" growth-from-practice status (oak-only MVP). None for items not in Tending.
    tending: TendingStatus | None = None


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
    cost: int  # coins to buy now: default-variant base + the next-item progressive surcharge
    unlocked: bool  # level requirement met
    hint: str | None  # what's needed to unlock (None when unlocked)
    variants: list[VariantOption]  # selectable base forms (empty for fixed-form items)
    blurb: str  # a short, calm flavour line (cosmetic; "" when the item has none)
    # A small pool of on-character example names, offered as an optional naming suggestion
    # (placeholder + shuffle, ADR-0015). Cosmetic only; [] when the item has none.
    suggested_names: list[str]


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
    # Optional plaque set at purchase time — a quiet personal touch (ADR-0015). Trimmed,
    # capped at NAME_MAX_LENGTH; empty/whitespace stored as None. Default None = unnamed.
    name: SanctuaryName = None


class PersonalizeRequest(BaseModel):
    """Set/clear the cosmetic personalization of an owned item (ADR-0015): its name, note,
    and favourite flag. All fields are optional; only the fields *present* in the request
    are changed (a partial update), so the UI can rename without touching the note. Passing
    an explicit `null` (or an empty/whitespace string) for `name`/`note` clears it.

    These touches are purely cosmetic — they never cost coins or move the item.
    """

    model_config = ConfigDict(extra="forbid")

    name: SanctuaryName = None
    note: SanctuaryNote = None
    favorite: bool | None = None


class CustomizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: str
    option: str


class MoveRequest(BaseModel):
    """Move an owned item to a grid cell (layout-only; never touches the economy)."""

    model_config = ConfigDict(extra="forbid")

    cell: int = Field(ge=0)  # target grid cell, row-major; must be a non-negative index

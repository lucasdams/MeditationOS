"""Sanctuary spend economy — earn coins by levelling up, spend them to buy items, pick a
**variant** at purchase, and mix-and-match **customizations** over time. See
docs/design/sanctuary.md and ADR-0011 (derived balance) + ADR-0012 (personalization).

Stored state is only *what you own*: each row's `item_key`, an optional `variant`, and a
`customizations` map of `{slot: option}`. The coin balance is computed on read — coins
earned from levels (a level computed from **earned XP**, total XP minus the volatile
streak bonus, so coins never decrease) minus coins spent on owned items. There is no
wallet row and no transaction ledger; the holdings *are* the ledger (ADR-0011).

Spend of one owned item = buy cost + variant cost delta + Σ (cost of each purchased
customization option) + a **progressive surcharge** that depends only on the item's
ordinal among the user's holdings (the k-th item acquired, 0-indexed, pays
`round(PROGRESSIVE_STEP * k)`). The surcharge is a deterministic function of acquisition
order, so the balance stays fully derived from holdings (ADR-0011/0013) — no wallet, no
ledger. Costs (buy, variants, customization options, the surcharge step) are all in-code
constants — retuning needs no migration.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.sanctuary import SanctuaryPlanting
from app.schemas.sanctuary import (
    AvailableSlot,
    BuyRequest,
    CustomizeRequest,
    MoveRequest,
    OwnedItem,
    SanctuaryScene,
    ShopItem,
    SlotOption,
    VariantOption,
)
from app.services import dashboard_service

# Coins granted per level reached. The garden is paced against this (see catalog costs).
# Raised from 50 → 70 to compensate for the front-loaded per-session XP curve, which makes
# XP — and therefore coins — accrue more slowly for longer sits (ADR-0013).
COINS_PER_LEVEL = 70

# Progressive pricing: each additional item the user owns costs more. The surcharge for the
# k-th holding (0-indexed by acquisition / `position` order) is `round(PROGRESSIVE_STEP * k)`,
# so the first item pays nothing extra and each later item pays a linearly growing premium.
# A linear step (rather than geometric) keeps later items expensive but not runaway, and the
# total is computable purely from the count + order of holdings — balance stays derived
# (ADR-0013). Combined with the cheaper base costs above, small/typical gardens (1–4 items)
# are no more expensive than before; only larger gardens pay meaningfully more.
PROGRESSIVE_STEP = 8


def progressive_surcharge(ordinal: int) -> int:
    """Extra coins charged for the `ordinal`-th item a user acquires (0-indexed).

    Deterministic in the ordinal alone, so total spend is derivable from holdings (no
    wallet/ledger). `ordinal` is the item's rank in the user's acquisition order.
    """
    return round(PROGRESSIVE_STEP * max(0, ordinal))


# --- Grid layout (ADR-0014) -------------------------------------------------------------
#
# The garden is laid out on a fixed-width, row-major grid the user rearranges by dragging.
# A `cell` is the flat index (row * GRID_COLUMNS + col). Layout is independent of the
# economy: cells never affect price (that is keyed off `position`). Both keys are tunable
# constants here so the grid can grow without a migration. GRID_CELLS caps the addressable
# layout space (move targets are validated against it); it is comfortably larger than any
# realistic garden so a buy always finds a free cell.
GRID_COLUMNS = 4
GRID_ROWS = 32
GRID_CELLS = GRID_COLUMNS * GRID_ROWS


def _lowest_free_cell(plantings: list[SanctuaryPlanting]) -> int:
    """The smallest non-negative cell not already used by this user's items — where a newly
    bought item lands (filling gaps left by rearrangements before extending the grid)."""
    used = {p.cell for p in plantings}
    cell = 0
    while cell in used:
        cell += 1
    return cell


@dataclass(frozen=True)
class Variant:
    """A base form chosen at purchase (e.g. a dog breed, a tree species)."""

    key: str
    cost_delta: int = 0  # extra coins over the buy cost for this form
    unlock_level: int = 1  # min level before this variant can be chosen


@dataclass(frozen=True)
class Option:
    """One named choice inside a customization slot (independent of other slots)."""

    key: str
    cost: int
    unlock_level: int = 1  # min level before this option can be applied


@dataclass(frozen=True)
class Slot:
    """A customization axis with named options; slots are independent (mix-and-match)."""

    key: str
    options: tuple[Option, ...]

    def option(self, option_key: str) -> Option | None:
        return next((o for o in self.options if o.key == option_key), None)


@dataclass(frozen=True)
class CatalogItem:
    key: str
    track: str  # "nature" | "structure" | "companion"
    cost: int  # coins to buy (the default variant, no customizations)
    unlock_level: int = 1  # min level before it appears in the shop
    variants: tuple[Variant, ...] = ()  # selectable base forms; () = single fixed form
    slots: tuple[Slot, ...] = ()  # mix-and-match customization axes

    @property
    def default_variant(self) -> str | None:
        return self.variants[0].key if self.variants else None

    def variant(self, variant_key: str | None) -> Variant | None:
        """The Variant for a key. `None`/absent resolves to the default variant (if any)."""
        if not self.variants:
            return None
        if variant_key is None:
            return self.variants[0]
        return next((v for v in self.variants if v.key == variant_key), None)

    def slot(self, slot_key: str) -> Slot | None:
        return next((s for s in self.slots if s.key == slot_key), None)

    def variant_cost_delta(self, variant_key: str | None) -> int:
        v = self.variant(variant_key)
        return v.cost_delta if v is not None else 0

    def customizations_cost(self, customizations: dict[str, str]) -> int:
        """Σ cost of each purchased customization option (unknown slots/options ignored)."""
        total = 0
        for slot_key, option_key in customizations.items():
            slot = self.slot(slot_key)
            if slot is None:
                continue
            opt = slot.option(option_key)
            if opt is not None:
                total += opt.cost
        return total

    def spent(self, variant_key: str | None, customizations: dict[str, str]) -> int:
        """Coins sunk into one owned instance — buy + variant delta + customizations."""
        return (
            self.cost
            + self.variant_cost_delta(variant_key)
            + self.customizations_cost(customizations)
        )


# --- Catalog builders -------------------------------------------------------------------
#
# Costs are tunable constants. A terse fluent builder keeps the catalog readable; variant
# and option costs are explicit so retuning stays a one-line edit (no migration).


@dataclass
class _Build:
    """Mutable helper to assemble a CatalogItem fluently."""

    key: str
    track: str
    cost: int
    unlock_level: int = 1
    _variants: list[Variant] = field(default_factory=list)
    _slots: list[Slot] = field(default_factory=list)

    def variants(self, *keys: str) -> "_Build":
        # Variants are free by default (they change the base form, not the value); the
        # first listed is the default applied to existing/legacy rows.
        self._variants = [Variant(key=k) for k in keys]
        return self

    def slot(self, key: str, *opts: tuple[str, int]) -> "_Build":
        self._slots.append(Slot(key=key, options=tuple(Option(o, c) for o, c in opts)))
        return self

    def build(self) -> CatalogItem:
        return CatalogItem(
            key=self.key,
            track=self.track,
            cost=self.cost,
            unlock_level=self.unlock_level,
            variants=tuple(self._variants),
            slots=tuple(self._slots),
        )


def _grown(cost: int) -> tuple[str, int]:
    # The "grown" / bigger size — successor to the old tier ladder (preserves spend; the
    # tier-1 upgrade cost was round(cost * 1.5)).
    return ("grown", round(cost * 1.5))


# In-code catalog — the single source of truth for what's buyable, its forms, and costs.
SANCTUARY_CATALOG: dict[str, CatalogItem] = {
    # --- Nature -----------------------------------------------------------------------
    "tree": (
        _Build("tree", "nature", 30)
        .variants("oak", "pine", "cherry", "willow")
        .slot("grown", _grown(40))
        .slot("foliage", ("fruit", 30), ("blossom", 30), ("autumn", 30))
        .slot("swing", ("swing", 25))
        .slot("birdhouse", ("birdhouse", 20))
        .build()
    ),
    "flower": (
        _Build("flower", "nature", 20)
        .variants("rose", "tulip", "sunflower", "daisy")
        .slot("grown", _grown(25))
        .slot("bloom", ("double", 18))
        .slot("butterfly", ("butterfly", 20))
        .build()
    ),
    "pond": (
        _Build("pond", "nature", 60, unlock_level=4)
        .slot("grown", _grown(80))
        .slot("lilies", ("lilies", 40))
        .slot("koi", ("koi", 50))
        .slot("bridge", ("bridge", 60))
        .build()
    ),
    # --- Structures -------------------------------------------------------------------
    "hut": (
        _Build("hut", "structure", 45, unlock_level=2)
        .variants("straw", "wood")
        .slot("grown", _grown(60))
        .slot("chimney_smoke", ("smoke", 30))
        .slot("garden", ("garden", 35))
        .slot("lights", ("lights", 25))
        .build()
    ),
    "cottage": (
        _Build("cottage", "structure", 70, unlock_level=3)
        .variants("cream", "stone")
        .slot("grown", _grown(90))
        .slot("chimney_smoke", ("smoke", 40))
        .slot("garden", ("garden", 45))
        .slot("lights", ("lights", 35))
        .build()
    ),
    "barn": (
        _Build("barn", "structure", 90, unlock_level=4)
        .variants("red", "gray")
        .slot("grown", _grown(120))
        .slot("chimney_smoke", ("smoke", 50))
        .slot("garden", ("garden", 55))
        .slot("lights", ("lights", 45))
        .build()
    ),
    "car": (
        _Build("car", "structure", 100, unlock_level=5)
        .variants("red", "blue", "yellow")
        .slot("grown", _grown(130))
        .slot("lights", ("lights", 45))
        .build()
    ),
    "beach_house": (
        _Build("beach_house", "structure", 110, unlock_level=6)
        .variants("white", "teal")
        .slot("grown", _grown(150))
        .slot("garden", ("garden", 60))
        .slot("lights", ("lights", 55))
        .build()
    ),
    "boat": (
        _Build("boat", "structure", 130, unlock_level=8)
        .variants("wood", "white")
        .slot("grown", _grown(170))
        .slot("lights", ("lights", 60))
        .build()
    ),
    # --- Companions -------------------------------------------------------------------
    "goldfish": (
        _Build("goldfish", "companion", 20)
        .variants("orange", "white", "black")
        .slot("grown", _grown(30))
        .build()
    ),
    "bird": (
        _Build("bird", "companion", 25, unlock_level=2)
        .variants("bluebird", "robin", "canary")
        .slot("grown", _grown(35))
        .slot("accessory", ("hat", 25))
        .build()
    ),
    "cat": (
        _Build("cat", "companion", 40, unlock_level=3)
        .variants("gray", "ginger", "black", "white")
        .slot("grown", _grown(50))
        .slot("accessory", ("collar", 25), ("bandana", 25), ("hat", 30))
        .build()
    ),
    "snake": (
        _Build("snake", "companion", 45, unlock_level=4)
        .variants("green", "amber", "blue")
        .slot("grown", _grown(60))
        .slot("accessory", ("hat", 30))
        .build()
    ),
    "fox": (
        _Build("fox", "companion", 50, unlock_level=5)
        .variants("red", "arctic")
        .slot("grown", _grown(70))
        .slot("accessory", ("collar", 30), ("bandana", 30))
        .build()
    ),
    "dog": (
        _Build("dog", "companion", 70, unlock_level=6)
        .variants("corgi", "husky", "shiba", "dalmatian")
        .slot("grown", _grown(90))
        .slot("accessory", ("collar", 30), ("bandana", 35), ("hat", 40))
        .build()
    ),
}


class UnknownItem(Exception):
    """The requested item_key is not in the catalog."""


class UnknownVariant(Exception):
    """The requested variant is not offered for this item."""


class UnknownSlotOption(Exception):
    """The requested customization slot or option is not offered for this item."""


class ItemLocked(Exception):
    """A level requirement (item, variant, or option) isn't met yet."""


class InsufficientCoins(Exception):
    """Not enough coins for this purchase/customization."""


class AlreadyApplied(Exception):
    """The item already has that exact option in that slot — no-op."""


class CellOutOfBounds(Exception):
    """The requested grid cell is outside the addressable layout (0 ≤ cell < GRID_CELLS)."""


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


def _customizations(row: SanctuaryPlanting) -> dict[str, str]:
    """The row's purchased customizations, defensively normalized to {str: str}.

    Legacy rows (created before personalization) have no customizations → {} → no extra
    spend, exactly the base form. Coins never retroactively rise (ADR-0011 monotonicity).
    """
    raw = row.customizations or {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if isinstance(v, (str, int))}


def _spent(plantings: list[SanctuaryPlanting]) -> int:
    """Coins sunk into the whole garden: per-item spend plus the progressive surcharge for
    each holding's ordinal. We key the surcharge off the row's stable `position` (the dense,
    monotonic acquisition order assigned at buy time), so the total is a deterministic
    function of holdings alone — no wallet/ledger (ADR-0013)."""
    total = 0
    for p in plantings:
        item = SANCTUARY_CATALOG.get(p.item_key)
        if item is not None:
            total += item.spent(p.variant, _customizations(p)) + progressive_surcharge(p.position)
    return total


def _available_slots(
    item: CatalogItem, customizations: dict[str, str], balance: int, level: int
) -> list[AvailableSlot]:
    """Slots/options still applicable: each option with its cost + locked/affordable/applied
    hints. Calm, not pushy — the UI uses these to gently offer the next touch."""
    out: list[AvailableSlot] = []
    for slot in item.slots:
        applied = customizations.get(slot.key)
        opts: list[SlotOption] = []
        for o in slot.options:
            opts.append(
                SlotOption(
                    option=o.key,
                    cost=o.cost,
                    unlocked=level >= o.unlock_level,
                    unlock_hint=None
                    if level >= o.unlock_level
                    else f"Reach level {o.unlock_level}",
                    affordable=balance >= o.cost,
                    applied=applied == o.key,
                )
            )
        out.append(AvailableSlot(slot=slot.key, applied=applied, options=opts))
    return out


def _build_scene(
    plantings: list[SanctuaryPlanting], coins_earned: int, level: int, streak: int
) -> SanctuaryScene:
    balance = max(0, coins_earned - _spent(plantings))
    owned: list[OwnedItem] = []
    # Present the garden in grid order (by `cell`); `position` stays the economy key only.
    for p in sorted(plantings, key=lambda p: p.cell):
        item = SANCTUARY_CATALOG.get(p.item_key)
        if item is None:
            continue
        customizations = _customizations(p)
        owned.append(
            OwnedItem(
                id=str(p.id),
                item_key=p.item_key,
                track=item.track,
                position=p.position,
                cell=p.cell,
                variant=p.variant if p.variant is not None else item.default_variant,
                customizations=customizations,
                available=_available_slots(item, customizations, balance, level),
            )
        )
    # Every shop item, if bought next, lands at the same ordinal and so carries the same
    # progressive surcharge that `buy()` will actually charge. Surface that surcharge-inclusive
    # cost (not the bare base) so the displayed price and the client's affordability gate match
    # what `buy()` deducts — otherwise a large garden shows a cheap, "affordable" price and the
    # purchase 409s (ADR-0013).
    next_surcharge = progressive_surcharge((max((p.position for p in plantings), default=-1)) + 1)
    shop = [
        ShopItem(
            item_key=item.key,
            track=item.track,
            cost=item.cost + next_surcharge,
            unlocked=level >= item.unlock_level,
            hint=None if level >= item.unlock_level else f"Reach level {item.unlock_level}",
            variants=[
                VariantOption(
                    variant=v.key,
                    cost_delta=v.cost_delta,
                    unlocked=level >= v.unlock_level,
                    unlock_hint=None
                    if level >= v.unlock_level
                    else f"Reach level {v.unlock_level}",
                )
                for v in item.variants
            ],
        )
        for item in SANCTUARY_CATALOG.values()
    ]
    return SanctuaryScene(
        coins=balance,
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
    """Buy a catalog item with an optional chosen variant. Validates: known item, known +
    unlocked variant, item unlocked by level, and affordable (buy cost + variant delta)."""
    item = SANCTUARY_CATALOG.get(data.item_key)
    if item is None:
        raise UnknownItem(data.item_key)
    variant = item.variant(data.variant)  # None when item has no variants
    if data.variant is not None and variant is None:
        raise UnknownVariant(data.variant)
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    if level < item.unlock_level:
        raise ItemLocked(data.item_key)
    if variant is not None and level < variant.unlock_level:
        raise ItemLocked(variant.key)
    plantings = _load(db, user_id)
    # The next item's ordinal (its position) drives its progressive surcharge, so the
    # affordability check uses the same surcharged cost the balance will reflect (ADR-0013).
    next_position = (max((p.position for p in plantings), default=-1)) + 1
    price = (
        item.cost
        + (variant.cost_delta if variant is not None else 0)
        + progressive_surcharge(next_position)
    )
    if coins_earned - _spent(plantings) < price:
        raise InsufficientCoins(data.item_key)
    db.add(
        SanctuaryPlanting(
            user_id=user_id,
            item_key=item.key,
            position=next_position,
            # Layout-only: the new item lands in the lowest free grid cell (ADR-0014). This
            # is independent of `position` and never affects price.
            cell=_lowest_free_cell(plantings),
            variant=variant.key if variant is not None else None,
            customizations={},
        )
    )
    db.commit()
    return _build_scene(_load(db, user_id), coins_earned, level, streak)


def customize(
    db: DBSession,
    user_id: uuid.UUID,
    planting_id: uuid.UUID,
    data: CustomizeRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SanctuaryScene | None:
    """Apply a customization (slot → option) to an owned item. Returns None if the item
    isn't the caller's. Raises on unknown slot/option, locked option, already-applied, or
    insufficient coins. Each customization costs coins (deducted via the derived balance).
    """
    row = db.execute(
        select(SanctuaryPlanting).where(
            SanctuaryPlanting.id == planting_id, SanctuaryPlanting.user_id == user_id
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    item = SANCTUARY_CATALOG.get(row.item_key)
    if item is None:
        return None
    slot = item.slot(data.slot)
    if slot is None:
        raise UnknownSlotOption(data.slot)
    option = slot.option(data.option)
    if option is None:
        raise UnknownSlotOption(data.option)
    current = _customizations(row)
    if current.get(slot.key) == option.key:
        raise AlreadyApplied(data.option)
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    if level < option.unlock_level:
        raise ItemLocked(option.key)
    plantings = _load(db, user_id)
    # Charge the difference: switching options within a slot costs only the new option's
    # cost over what's already sunk into that slot, so a swap is never punishing and the
    # balance stays consistent with `spent()`.
    already_in_slot = 0
    if slot.key in current:
        prev = slot.option(current[slot.key])
        already_in_slot = prev.cost if prev is not None else 0
    net_cost = option.cost - already_in_slot
    if coins_earned - _spent(plantings) < net_cost:
        raise InsufficientCoins(row.item_key)
    updated = dict(current)
    updated[slot.key] = option.key
    row.customizations = updated
    db.commit()
    return _build_scene(_load(db, user_id), coins_earned, level, streak)


def move(
    db: DBSession,
    user_id: uuid.UUID,
    planting_id: uuid.UUID,
    data: MoveRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SanctuaryScene | None:
    """Move an owned item to a grid `cell` (layout only — never touches `position` or the
    economy). Returns None if the item isn't the caller's. Raises CellOutOfBounds if the
    target is outside the grid.

    If another of the user's items already sits in the target cell, the two swap cells;
    otherwise the item simply takes the empty cell. The swap is done in one transaction,
    staging the moving row to a temporary out-of-range sentinel cell first so the
    UNIQUE(user_id, cell) constraint is never momentarily violated.
    """
    if data.cell < 0 or data.cell >= GRID_CELLS:
        raise CellOutOfBounds(data.cell)
    row = db.execute(
        select(SanctuaryPlanting).where(
            SanctuaryPlanting.id == planting_id, SanctuaryPlanting.user_id == user_id
        )
    ).scalar_one_or_none()
    if row is None:
        return None

    if row.cell != data.cell:
        occupant = db.execute(
            select(SanctuaryPlanting).where(
                SanctuaryPlanting.user_id == user_id,
                SanctuaryPlanting.cell == data.cell,
            )
        ).scalar_one_or_none()
        source_cell = row.cell
        if occupant is None:
            row.cell = data.cell
        else:
            # Swap: park the moving row on a temporary sentinel cell (out of the addressable
            # range, so it can never collide with a real cell), flush, then place both.
            row.cell = -1
            db.flush()
            occupant.cell = source_cell
            db.flush()
            row.cell = data.cell
        db.commit()

    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    return _build_scene(_load(db, user_id), coins_earned, level, streak)

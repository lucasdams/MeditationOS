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

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.models.sanctuary import SanctuaryPlanting
from app.models.user import User
from app.schemas.sanctuary import (
    AvailableSlot,
    BuyRequest,
    CustomizeRequest,
    MoveRequest,
    OwnedItem,
    PersonalizeRequest,
    SanctuaryScene,
    ShopItem,
    SlotOption,
    VariantOption,
)
from app.services import dashboard_service

# Coins granted per level reached. The garden is paced against this (see catalog costs).
# 50 → 70 (ADR-0013) compensated for the front-loaded per-session XP curve, but that retune
# still under-shot how slowly coins accrue under that curve (a 20-min sit ≈ 20 XP, a long
# sit much less), so mid-level progress stalled. 70 → 80 (ADR-0016) restores a steady,
# satisfying cadence of purchases through the mid-levels without inflating early reward.
# Raising it only ever *raises* every existing garden's derived balance — the safe direction.
COINS_PER_LEVEL = 80

# Progressive pricing: each additional item the user owns costs more. The surcharge for the
# k-th holding (0-indexed by acquisition / `position` order) is `round(PROGRESSIVE_STEP * k)`,
# so the first item pays nothing extra and each later item pays a linearly growing premium.
# A linear step (rather than geometric) keeps later items expensive but not runaway, and the
# total is computable purely from the count + order of holdings — balance stays derived
# (ADR-0013). 8 → 6 (ADR-0016) softens the anti-hoarding tax so a growing garden feels fair
# rather than punitive, while still gently raising the stakes on each new acquisition.
# Lowering it only ever *lowers* an existing garden's spend → raises its balance (safe).
PROGRESSIVE_STEP = 6

# Flat fee (coins) charged when a user **resets** an owned item's customizations back to its
# base form (ADR-0019). Clearing the customizations refunds their sunk cost via the derived
# balance, so a reset would otherwise be a free undo that could be churned (buy → reset →
# rebuy) for no net cost. The fee — persisted in `users.sanctuary_reset_fees` and subtracted
# from the derived balance — makes each reset cost real coins, so reset-churn is strictly
# coin-negative. A tunable constant (no migration to retune).
SANCTUARY_RESET_FEE = 10


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
    track: str  # "nature" | "structure" | "companion" | "whimsy"
    cost: int  # coins to buy (the default variant, no customizations)
    unlock_level: int = 1  # min level before it appears in the shop
    variants: tuple[Variant, ...] = ()  # selectable base forms; () = single fixed form
    slots: tuple[Slot, ...] = ()  # mix-and-match customization axes
    # A short, calm flavour line surfaced quietly in the shop/plaque (ADR-0016). Cosmetic
    # only — never enters the spend computation. "" = no blurb.
    blurb: str = ""
    # A small pool of charming, on-character example names for this item (ADR-0015) — a
    # gnome name for the gnome, a fox name for the fox, a tree name for the tree. Surfaced
    # purely as an optional *suggestion* when naming (an input placeholder + a "suggest a
    # name" shuffle); the user always chooses, nothing is auto-assigned. Static per item
    # type, exactly like `blurb` — no DB change. Cosmetic only: never enters the spend
    # computation. () = no suggestions.
    suggested_names: tuple[str, ...] = ()

    @property
    def suggested_name(self) -> str | None:
        """The first suggested example name — the stable placeholder hint — or None."""
        return self.suggested_names[0] if self.suggested_names else None

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
    _blurb: str = ""
    _names: tuple[str, ...] = ()
    _variants: list[Variant] = field(default_factory=list)
    _slots: list[Slot] = field(default_factory=list)

    def blurb(self, text: str) -> "_Build":
        # A short, calm flavour line shown in the shop tooltip / on the plaque. Cosmetic.
        self._blurb = text
        return self

    def names(self, *names: str) -> "_Build":
        # A pool of charming, on-character example names offered as a naming *suggestion*
        # (placeholder + shuffle, ADR-0015). Cosmetic only; never affects price.
        self._names = names
        return self

    def variants(self, *keys: str) -> "_Build":
        # Variants are free by default (they change the base form, not the value); the
        # first listed is the default applied to existing/legacy rows.
        self._variants = [Variant(key=k) for k in keys]
        return self

    def slot(self, key: str, *opts: tuple[str, int]) -> "_Build":
        self._slots.append(Slot(key=key, options=tuple(Option(o, c) for o, c in opts)))
        return self

    def ladder(self, rungs: tuple[tuple[str, int, int], ...]) -> "_Build":
        # Adds the `grown` growth-ladder slot: each rung is (option_key, cost, unlock_level),
        # rising in cost *and* unlock_level. Unlike a plain `slot`, options here carry their
        # own level gate (later stages unlock as the user levels up).
        self._slots.append(
            Slot(
                key="grown",
                options=tuple(Option(o, c, unlock_level=u) for o, c, u in rungs),
            )
        )
        return self

    def form(self, *forms: tuple[str, int, int]) -> "_Build":
        # Adds the evolution-tree `form` fork (ADR-0021): a single mutually-exclusive slot
        # whose options are named *evolved forms* of the item, each a late-game branching
        # choice gated at or above the top of the growth ladder. Each form is
        # (option_key, cost, unlock_level). Because the `form` slot is mutually-exclusive
        # within (the existing slot semantics), choosing one form excludes the others — the
        # "fork". A swap between forms charges only the difference, like any slot, so a player
        # can re-route their tree's evolution without paying the full price again.
        #
        # The framework: declaring a fork is one `.form(...)` line per item. Tracks 2–4 add
        # their forks the same way — no new slot machinery, since `form` is an ordinary
        # mutually-exclusive slot routed through the generic customize/spend/preview paths.
        self._slots.append(
            Slot(
                key="form",
                options=tuple(Option(o, c, unlock_level=u) for o, c, u in forms),
            )
        )
        return self

    def build(self) -> CatalogItem:
        return CatalogItem(
            key=self.key,
            track=self.track,
            cost=self.cost,
            unlock_level=self.unlock_level,
            variants=tuple(self._variants),
            slots=tuple(self._slots),
            blurb=self._blurb,
            suggested_names=self._names,
        )


# --- Growth ladder (the `grown` slot) ---------------------------------------------------
#
# The size axis is a *sequential ladder* of stages, not a single on/off "grown" toggle. Each
# stage is one mutually-exclusive option in the `grown` slot, with a strictly rising cost and
# a non-decreasing unlock_level, so a plant visibly matures across four stages. Because slots
# are mutually-exclusive-within and a swap charges only the *difference* (see `customize`),
# advancing a stage charges incrementally and the total sunk into the slot is always exactly
# the currently-applied stage's cost — the derived balance handles it (ADR-0011/0013).
#
# CRITICAL backward-compat: the first rung is keyed literally "grown" at the *unchanged* cost
# round(base * 1.5) — the same value the old `_grown` helper returned and the same value the
# old tier-1 upgrade cost. So any legacy row whose customizations are {"grown": "grown"}
# still resolves to a real option and its `spent()` is byte-for-byte unchanged. The new rungs
# are pure additions above it and can only ever raise spend if a user chooses to advance.
#
# Deepened to FIVE stages (ADR-0021): a `venerable` rung is appended above `ancient` so a
# long-tended garden keeps deepening past the old four-step plateau. The existing four keys
# are preserved exactly (same order, same costs, same unlock levels), so every legacy row
# still resolves and re-prices identically; the new rung is a pure addition above the others
# and can only raise spend if a user chooses to climb to it. The ladder is built by zipping
# these three tuples (strict=True), so adding a stage is a one-token edit to each tuple.
GROWTH_STAGES: tuple[str, ...] = ("grown", "flourishing", "mature", "ancient", "venerable")

# Multipliers on the item's `base` cost for each ladder rung. The first (grown) is 1.5 — the
# historical value — and each later rung costs progressively more. Tunable constants; no
# migration. Unlock levels rise gently so later stages feel earned without gating the early
# garden. The fifth rung (venerable) sits at the top of the level curve, the natural floor
# the `form` evolution fork gates at/above (see _FORM_UNLOCK).
_GROWTH_COST_MULT: tuple[float, ...] = (1.5, 2.4, 3.6, 5.0, 6.6)
_GROWTH_UNLOCK: tuple[int, ...] = (1, 3, 5, 8, 11)

# The top of the growth ladder — the unlock level a late-game `form` fork is gated at or
# above (ADR-0021), so an evolved form is only ever chosen once a player has tended an item
# all the way up. Derived from the ladder so the fork tracks any future re-tuning of it.
TOP_GROWTH_UNLOCK: int = _GROWTH_UNLOCK[-1]


def _growth_ladder(base: int) -> tuple[tuple[str, int, int], ...]:
    """The `grown` slot's stage ladder for an item with the given `base` cost.

    Returns a tuple of (option_key, cost, unlock_level) rungs: the first keyed literally
    "grown" at round(base * 1.5) (legacy-preserving), each subsequent rung at a strictly
    higher cost and a non-decreasing unlock_level. Fed to `_Build.ladder`.
    """
    return tuple(
        (stage, round(base * mult), unlock)
        for stage, mult, unlock in zip(
            GROWTH_STAGES, _GROWTH_COST_MULT, _GROWTH_UNLOCK, strict=True
        )
    )


# --- Evolution fork (the `form` slot) ---------------------------------------------------
#
# A late-game *branching choice*: the `form` slot offers 2–3 named evolved forms of an item
# (e.g. an oak → mighty / blossoming / hollow-ancient). Like every slot it is
# mutually-exclusive-within, so choosing one form excludes the others — that within-slot
# exclusivity *is* the fork. Forms are gated at or above TOP_GROWTH_UNLOCK (the top of the
# growth ladder), so a player only forks an item they've already grown to the top.
#
# `_form_fork(base, *forms)` keeps fork declarations terse and consistent across tracks: each
# `form` is (option_key, cost_multiplier, unlock_offset). The cost is round(base * mult); the
# unlock is TOP_GROWTH_UNLOCK + offset (offset 0 = the top of the ladder, ≥1 = above it). The
# next-track agents add a fork by calling `.form(*_form_fork(base, ...))` — no new machinery.
def _form_fork(
    base: int, *forms: tuple[str, float, int]
) -> tuple[tuple[str, int, int], ...]:
    return tuple(
        (key, round(base * mult), TOP_GROWTH_UNLOCK + offset) for key, mult, offset in forms
    )


# In-code catalog — the single source of truth for what's buyable, its forms, and costs.
#
# Costs are tunable constants (no migration to retune). The ADR-0016 pass left every
# *existing* item's base/variant/option costs unchanged — the only economy levers touched
# globally are COINS_PER_LEVEL (70→80) and PROGRESSIVE_STEP (8→6), both of which only ever
# *raise* an existing garden's derived balance, so no pre-owned configuration can be driven
# negative by this retune. New items (the whimsy track + a few additions) are pure additions
# and can never affect a garden that doesn't own them. Blurbs are cosmetic flavour only.
SANCTUARY_CATALOG: dict[str, CatalogItem] = {
    # --- Nature -----------------------------------------------------------------------
    "tree": (
        _Build("tree", "nature", 30)
        .blurb("A patient old soul. It was here before you, and it's in no hurry.")
        .names("Old Oak", "Willowmere", "Evergreen", "Grandfather", "Mossbeard")
        .variants("oak", "pine", "cherry", "willow")
        .ladder(_growth_ladder(40))
        # Evolution fork (ADR-0021): once grown to the top, a tree branches into one of three
        # named final forms — a mighty broad-crowned giant, a blossom-laden bower, or a
        # hollowed elder with a knot-hollow. Mutually-exclusive: a tree is one of these.
        .form(
            *_form_fork(
                40, ("mighty", 4.0, 0), ("blossoming", 4.2, 1), ("hollow_ancient", 4.4, 2)
            )
        )
        .slot("foliage", ("fruit", 30), ("blossom", 30), ("autumn", 30))
        .slot("swing", ("swing", 25))
        .slot("birdhouse", ("birdhouse", 20))
        # New additive nature slot (ADR-0021): a little critter in the branches.
        .slot("critter", ("songbird", 22), ("squirrel", 24))
        .build()
    ),
    "flower": (
        _Build("flower", "nature", 20)
        .blurb("Small, bright, and quietly pleased with itself.")
        .names("Petal", "Sunny", "Daisy", "Poppy", "Marigold")
        .variants("rose", "tulip", "sunflower", "daisy")
        .ladder(_growth_ladder(25))
        # Evolution fork: a wild tangle, a tidy cultivated bloom, or a softly luminous one.
        .form(*_form_fork(25, ("wildflower", 4.0, 0), ("cultivated", 4.3, 1), ("luminous", 4.6, 2)))
        .slot("bloom", ("double", 18))
        .slot("butterfly", ("butterfly", 20))
        # New additive nature slot: a pollinator visiting the bloom.
        .slot("pollinator", ("bee", 20), ("dragonfly", 22))
        .build()
    ),
    "mushroom_ring": (
        _Build("mushroom_ring", "nature", 28, unlock_level=2)
        .blurb("A fairy ring of toadstools. Don't step inside after dark — or do.")
        .names("Fairy Ring", "Toadstool Circle", "The Wee Folk", "Pixie Glen")
        .variants("ruby", "amber", "violet")
        .ladder(_growth_ladder(36))
        # Evolution fork: a witch's circle of dark caps, or a pale moonlit ring.
        .form(*_form_fork(36, ("witchs_circle", 4.2, 0), ("moonlit", 4.6, 2)))
        .slot("glow", ("glow", 24))
        .slot("sprite", ("sprite", 30))
        # New additive nature slot: fireflies drifting over the ring.
        .slot("firefly", ("fireflies", 24))
        .build()
    ),
    "pond": (
        _Build("pond", "nature", 60, unlock_level=4)
        .blurb("Still water. Good for skipping stones and skipping worries.")
        .names("Still Waters", "The Mirror", "Mossbank", "Reflection Pool")
        .ladder(_growth_ladder(80))
        # Evolution fork: a crisp mountain tarn, or a lotus-strewn pool.
        .form(*_form_fork(80, ("mountain_tarn", 3.8, 0), ("lotus_pool", 4.2, 2)))
        .slot("lilies", ("lilies", 40))
        .slot("koi", ("koi", 50))
        .slot("bridge", ("bridge", 60))
        # New additive nature slot: a waterfowl on the water.
        .slot("waterfowl", ("duck", 42), ("swan", 50))
        .build()
    ),
    # --- Structures -------------------------------------------------------------------
    # Evolution trees applied to the STRUCTURE track (ADR-0021, part 2 of the per-track
    # rollout). Each structure gains a late-game `form` fork of fitting architectural forms
    # (gated at/above the ladder top via _form_fork) and one structure-appropriate additive
    # slot (lighting / garden trim / banner). Same framework as the nature track — no new
    # machinery, no migration; the `venerable` 5th growth rung is shared globally.
    "hut": (
        _Build("hut", "structure", 45, unlock_level=2)
        .blurb("Cosy enough for one, with room for a kettle.")
        .names("The Snug", "Little Hideaway", "Kettle Cottage", "The Burrow")
        .variants("straw", "wood")
        .ladder(_growth_ladder(60))
        # Evolution fork: a snug thatched cottage, a stilted treehouse, or a tucked-away hermitage.
        .form(*_form_fork(60, ("thatched", 4.0, 0), ("treehouse", 4.3, 1), ("hermitage", 4.6, 2)))
        .slot("chimney_smoke", ("smoke", 30))
        .slot("garden", ("garden", 35))
        .slot("lights", ("lights", 25))
        # New additive structure slot (ADR-0021): a window-box of flowers or herbs under the sill.
        .slot("window_box", ("flowers", 22), ("herbs", 22))
        .build()
    ),
    "cottage": (
        _Build("cottage", "structure", 70, unlock_level=3)
        .blurb("Crooked windows, warm light, the smell of something baking.")
        .names("Honeysuckle", "The Bakehouse", "Rosewood Cottage", "Hearthstone")
        .variants("cream", "stone")
        .ladder(_growth_ladder(90))
        # Evolution fork: a cosy thatched home, a grand many-gabled manor, or an enchanted dwelling.
        .form(*_form_fork(90, ("cosy", 4.0, 0), ("grand_manor", 4.3, 1), ("enchanted", 4.6, 2)))
        .slot("chimney_smoke", ("smoke", 40))
        .slot("garden", ("garden", 45))
        .slot("lights", ("lights", 35))
        # New additive structure slot: climbing ivy up the walls.
        .slot("ivy", ("ivy", 35))
        .build()
    ),
    "barn": (
        _Build("barn", "structure", 90, unlock_level=4)
        .blurb("Big doors, big yawns. The unofficial heart of the place.")
        .names("The Old Barn", "Hayloft", "Big Red", "The Homestead")
        .variants("red", "gray")
        .ladder(_growth_ladder(120))
        # Evolution fork: a busy working farm, a stately heritage barn, or a festive party barn.
        .form(
            *_form_fork(
                120, ("working_farm", 3.8, 0), ("heritage", 4.1, 1), ("festival", 4.4, 2)
            )
        )
        .slot("chimney_smoke", ("smoke", 50))
        .slot("garden", ("garden", 55))
        .slot("lights", ("lights", 45))
        # New additive structure slot: a rooster weathervane on the ridge.
        .slot("weathervane", ("rooster", 40))
        .build()
    ),
    "car": (
        _Build("car", "structure", 100, unlock_level=5)
        .blurb("Always packed for a trip you keep meaning to take.")
        .names("Old Faithful", "The Getaway", "Bessie", "Sunday Driver")
        .variants("red", "blue", "yellow")
        .ladder(_growth_ladder(130))
        # Evolution fork: a polished vintage roadster or a cosy camper van.
        .form(*_form_fork(130, ("vintage", 3.8, 0), ("camper", 4.2, 2)))
        .slot("lights", ("lights", 45))
        # New additive structure slot: a little pennant flag flying from the aerial.
        .slot("flag", ("pennant", 30))
        .build()
    ),
    "beach_house": (
        _Build("beach_house", "structure", 110, unlock_level=6)
        .blurb("Salt air and a porch made for doing absolutely nothing.")
        .names("Saltwind", "The Sandcastle", "Tidepool", "Seabreeze")
        .variants("white", "teal")
        .ladder(_growth_ladder(150))
        # Evolution fork: a breezy beach cabana, a lighthouse-keeper's cottage, or a stilt house.
        .form(
            *_form_fork(
                150, ("cabana", 3.8, 0), ("lighthouse_keeper", 4.1, 1), ("stilt_house", 4.4, 2)
            )
        )
        .slot("garden", ("garden", 60))
        .slot("lights", ("lights", 55))
        # New additive structure slot: strung bunting along the eave.
        .slot("bunting", ("bunting", 36))
        .build()
    ),
    "boat": (
        _Build("boat", "structure", 130, unlock_level=8)
        .blurb("A little vessel for a slow drift. Bring snacks.")
        .names("The Driftwood", "Little Dipper", "Seafarer", "Slow Current")
        .variants("wood", "white")
        .ladder(_growth_ladder(170))
        # Evolution fork: a tall-masted sailboat or a snug fishing trawler.
        .form(*_form_fork(170, ("sailboat", 3.8, 0), ("fishing_boat", 4.2, 2)))
        .slot("lights", ("lights", 60))
        # New additive structure slot: a pennant flying from the masthead.
        .slot("pennant", ("pennant", 40))
        .build()
    ),
    # --- Companions -------------------------------------------------------------------
    # Evolution trees applied to the COMPANION track (ADR-0021, part 3 of the per-track
    # rollout). Each companion gains a late-game `form` fork of fitting personality/pose/
    # markings forms (gated at/above the ladder top via _form_fork) and one companion-
    # appropriate additive slot — a `toy` (ball / yarn / stick / …) that doesn't duplicate the
    # existing headwear / collar / attire dress-up slots (ADR-0020). Same framework as the
    # nature/structure tracks — no new machinery, no migration; the `venerable` 5th growth rung
    # is shared globally.
    "goldfish": (
        _Build("goldfish", "companion", 20)
        .blurb("Three-second memory, infinite serenity. We could learn a lot.")
        .names("Bubbles", "Goldie", "Finn", "Splash", "Marigold")
        .variants("orange", "white", "black")
        .ladder(_growth_ladder(30))
        # Evolution fork: a flowing fantail show-fish, or a deep koi-kissed pond dweller.
        .form(*_form_fork(30, ("fantail", 4.0, 0), ("koi_kissed", 4.4, 2)))
        # New additive companion slot (ADR-0021): a little plaything in the bowl.
        .slot("toy", ("bubble_ring", 18), ("treasure", 22))
        .build()
    ),
    "bird": (
        _Build("bird", "companion", 25, unlock_level=2)
        .blurb("Sings first thing, asks for nothing. A fine alarm clock.")
        .names("Pip", "Chirp", "Sunny", "Bluebell", "Wren")
        .variants("bluebird", "robin", "canary")
        .ladder(_growth_ladder(35))
        # Evolution fork: a full-throated songful form, a showy plumed crest, or a far-ranging
        # migratory traveller.
        .form(*_form_fork(35, ("songful", 4.0, 0), ("plumed", 4.3, 1), ("migratory", 4.6, 2)))
        .slot("accessory", ("hat", 25))
        .slot("headwear", ("hat", 25), ("flower_crown", 26), ("tiny_crown", 30))
        .slot("attire", ("scarf", 24), ("sunglasses", 26))
        # New additive companion slot (ADR-0021): a perch toy to play with.
        .slot("toy", ("bell_toy", 20), ("mirror", 22))
        .build()
    ),
    "cat": (
        _Build("cat", "companion", 40, unlock_level=3)
        .blurb("Will sit with you. On its terms. Probably on your keyboard.")
        .names("Mochi", "Whiskers", "Marmalade", "Shadow", "Clementine")
        .variants("gray", "ginger", "black", "white")
        .ladder(_growth_ladder(50))
        .slot("accessory", ("collar", 25), ("bandana", 25), ("hat", 30))
        # New additive dress-up slots (ADR-0019): each independent of the others, so a cat can
        # wear a flower crown AND a bell collar AND sunglasses all at once. Mutually-exclusive
        # within each slot; switching options charges only the difference.
        .slot("headwear", ("hat", 28), ("flower_crown", 30), ("tiny_crown", 34))
        .slot("collar", ("bandana", 24), ("bowtie", 26), ("bell", 28))
        .slot("attire", ("scarf", 24), ("sunglasses", 28))
        # Evolution fork: a curled-up cosy lap-cat, a lithe sleek hunter, or a wise mystic.
        .form(*_form_fork(50, ("lap_cat", 4.0, 0), ("sleek_hunter", 4.3, 1), ("mystic", 4.6, 2)))
        # New additive companion slot (ADR-0021): a cat's plaything.
        .slot("toy", ("yarn", 24), ("feather", 22))
        .build()
    ),
    "snake": (
        _Build("snake", "companion", 45, unlock_level=4)
        .blurb("A long, slow noodle. Surprisingly good company.")
        .names("Noodle", "Sir Hiss", "Ziggy", "Slinky", "Basil")
        .variants("green", "amber", "blue")
        .ladder(_growth_ladder(60))
        .slot("accessory", ("hat", 30))
        .slot("headwear", ("hat", 30), ("tiny_crown", 34))
        # Evolution fork: a neatly-coiled rester, or a regal diamond-patterned form.
        .form(*_form_fork(60, ("coiled", 4.0, 0), ("patterned", 4.4, 2)))
        # New additive companion slot (ADR-0021): a basking stone to curl around.
        .slot("toy", ("basking_stone", 26))
        .build()
    ),
    "fox": (
        _Build("fox", "companion", 50, unlock_level=5)
        .blurb("Clever, quiet, and up to something. You'll never know what.")
        .names("Ember", "Rusty", "Vixen", "Juniper", "Sly")
        .variants("red", "arctic")
        .ladder(_growth_ladder(70))
        .slot("accessory", ("collar", 30), ("bandana", 30))
        .slot("headwear", ("hat", 30), ("flower_crown", 32), ("tiny_crown", 36))
        .slot("collar", ("bandana", 28), ("bowtie", 30), ("bell", 32))
        .slot("attire", ("scarf", 28), ("sunglasses", 30))
        # Evolution fork: a leaf-dappled woodland fox, a snowy arctic form, or a fire-kissed one.
        .form(
            *_form_fork(
                70, ("woodland", 4.0, 0), ("arctic_form", 4.3, 1), ("fire_kissed", 4.6, 2)
            )
        )
        # New additive companion slot (ADR-0021): a fox at play with a found toy.
        .slot("toy", ("ball", 28), ("stick", 26))
        .build()
    ),
    "hedgehog": (
        _Build("hedgehog", "companion", 38, unlock_level=3)
        .blurb("Pointy on the outside, soft about everything on the inside.")
        .names("Bramble", "Quill", "Pokey", "Thistle", "Hazel")
        .variants("brown", "cream", "salt")
        .ladder(_growth_ladder(48))
        .slot("accessory", ("scarf", 26), ("leaf", 22))
        .slot("headwear", ("hat", 26), ("flower_crown", 28))
        # Evolution fork: a snug curled-up form, or a woodland forager dressed in autumn leaves.
        .form(*_form_fork(48, ("snug", 4.0, 0), ("forager", 4.4, 2)))
        # New additive companion slot (ADR-0021): an apple to roll home on its spines.
        .slot("toy", ("apple", 22))
        .build()
    ),
    "snail": (
        _Build("snail", "companion", 22, unlock_level=2)
        .blurb("The garden's slowest philosopher. Carries home everywhere.")
        .names("Gary", "Turbo", "Shelly", "Pokey", "Sluggo")
        .variants("amber", "minty", "rosy")
        .ladder(_growth_ladder(28))
        .slot("accessory", ("hat", 24))
        # Evolution fork: a tidy mossy garden snail, or a jewel-shelled treasure.
        .form(*_form_fork(28, ("mossy_garden", 4.0, 0), ("jeweled", 4.4, 2)))
        # New additive companion slot (ADR-0021): a tiny leaf the snail nibbles on.
        .slot("toy", ("leaf_toy", 18))
        .build()
    ),
    "dog": (
        _Build("dog", "companion", 70, unlock_level=6)
        .blurb("Thinks today is the best day ever. Every single day.")
        .names("Biscuit", "Cooper", "Maple", "Scout", "Pepper")
        .variants("corgi", "husky", "shiba", "dalmatian")
        .ladder(_growth_ladder(90))
        .slot("accessory", ("collar", 30), ("bandana", 35), ("hat", 40))
        .slot("headwear", ("hat", 30), ("flower_crown", 32), ("tiny_crown", 38))
        .slot("collar", ("bandana", 28), ("bowtie", 30), ("bell", 32))
        .slot("attire", ("scarf", 28), ("sunglasses", 32))
        # Evolution fork: a bouncy playful pup, a noble regal hound, or a steadfast guardian.
        .form(*_form_fork(90, ("playful", 4.0, 0), ("regal", 4.3, 1), ("guardian", 4.6, 2)))
        # New additive companion slot (ADR-0021): a dog's favourite plaything.
        .slot("toy", ("ball", 30), ("stick", 28), ("bone", 30))
        .build()
    ),
    # --- Whimsy -----------------------------------------------------------------------
    # A delightful little troupe of garden friends and curios: characterful, low-stakes,
    # and threaded through the level ladder so there's a small smile to buy at most levels.
    #
    # Evolution trees applied to the WHIMSY track (ADR-0021, part 4 — the FINAL part of the
    # per-track rollout; with this the framework is live on all four tracks). Each whimsy item
    # gains a late-game `form` fork of fitting whimsical evolved forms (e.g. gnome → wandering /
    # wizardly / dozing; fairy-door → mossy / royal / starlit; tea-cart → garden-party /
    # patisserie / high-tea), gated at/above the ladder top via _form_fork, and ONE new themed
    # additive slot that doesn't duplicate the item's own ADR-0016 slots (a glow / sparkle /
    # critter / seasonal extra). Same framework as the other tracks — no new machinery, no
    # migration; the shared `venerable` 5th growth rung is reused.
    #
    # Key-collision care (as the companion track did with `lap_cat` / `mossy_garden`): form
    # and option keys are global label keys, so they're namespaced where a plain word would
    # clash with an existing key (e.g. the gnome's `dozing`, not `sleepy` — `sleepy` is already
    # a gnome *variant*; the new gnome slot `toadstool`'s option keyed `toadstool_cap`, not the
    # `toadstool` variant key; the lantern's `star_lantern` / `spirit_lantern`, etc.).
    "garden_gnome": (
        _Build("garden_gnome", "whimsy", 26, unlock_level=2)
        .blurb("Stands guard with great seriousness over a patch of nothing in particular.")
        .names("Bramblewick", "Thistlebeard", "Mossback", "Pip", "Tomte")
        .variants("classic", "mossy", "sleepy")
        .ladder(_growth_ladder(32))
        .slot("lantern", ("lantern", 24))
        .slot("companion", ("snail", 22))
        # Evolution fork: a wandering pilgrim with a staff, a star-hatted wizardly sage, or a
        # dozing gnome asleep on the job. (`dozing`, not `sleepy` — that's already a variant.)
        .form(
            *_form_fork(
                32, ("wandering", 4.0, 0), ("wizardly", 4.3, 1), ("dozing", 4.6, 2)
            )
        )
        # New themed additive whimsy slot (ADR-0021): a toadstool sprouting at the gnome's feet.
        .slot("toadstool", ("toadstool_cap", 22))
        .build()
    ),
    "wind_chime": (
        _Build("wind_chime", "whimsy", 30, unlock_level=3)
        .blurb("Hung from a branch, it turns the breeze into something you can hear.")
        .names("Whisper", "Breeze Song", "Tinkle", "Zephyr")
        .variants("brass", "bamboo", "seaglass")
        .ladder(_growth_ladder(38))
        .slot("ribbon", ("ribbon", 22))
        .slot("bell", ("bell", 26))
        # Evolution fork: a faceted crystal chime catching the light, or a row of reedy pan-pipes.
        .form(*_form_fork(38, ("crystal_chime", 4.0, 0), ("pan_pipes", 4.4, 2)))
        # New themed additive whimsy slot: a little bird come to perch on the branch.
        .slot("perched_bird", ("chickadee", 22))
        .build()
    ),
    "lantern": (
        _Build("lantern", "whimsy", 34, unlock_level=3)
        .blurb("A small, steady glow for the evenings. It waits up for you.")
        .names("Ember", "Nightlight", "Beacon", "Glimmer")
        .variants("paper", "iron", "stone")
        .ladder(_growth_ladder(42))
        .slot("flame", ("warm", 24), ("blue", 28))
        .slot("moth", ("moth", 20))
        # Evolution fork: a firefly-filled jar, a hanging star-lantern, or a wisp-lit spirit lamp.
        .form(
            *_form_fork(
                42, ("firefly_lantern", 4.0, 0), ("star_lantern", 4.3, 1),
                ("spirit_lantern", 4.6, 2)
            )
        )
        # New themed additive whimsy slot: a hanging charm dangling beneath the lantern.
        .slot("charm", ("crystal_charm", 22))
        .build()
    ),
    "frog_lily": (
        _Build("frog_lily", "whimsy", 36, unlock_level=4)
        .blurb("A contented frog on a lily pad. The world's least urgent creature.")
        .names("Sir Hops", "Lily", "Croaky", "Bartholomew", "Pip")
        .variants("green", "golden", "blue")
        .ladder(_growth_ladder(46))
        .slot("crown", ("crown", 30))
        .slot("hat", ("hat", 26))
        # Evolution fork: a fairy-tale frog prince with a crown, or a serene meditating zen frog.
        .form(*_form_fork(46, ("frog_prince", 4.0, 0), ("zen_frog", 4.4, 2)))
        # New themed additive whimsy slot: a dragonfly hovering over the lily pad.
        .slot("dragonfly_friend", ("pond_dragonfly", 22))
        .build()
    ),
    "scarecrow": (
        _Build("scarecrow", "whimsy", 48, unlock_level=5)
        .blurb("Scares precisely no one. The crows bring it gifts.")
        .names("Old Patch", "Stitches", "Hayworth", "Scraps")
        .variants("straw", "patchwork", "pumpkin")
        .ladder(_growth_ladder(60))
        .slot("crow", ("crow", 28))
        .slot("lights", ("lights", 32))
        # Evolution fork: a bountiful harvest guardian, a spooky jack-o'-lantern one, or a
        # dapper gentleman scarecrow in a top hat.
        .form(
            *_form_fork(
                60, ("harvest_guard", 4.0, 0), ("spooky", 4.3, 1), ("dapper", 4.6, 2)
            )
        )
        # New themed additive whimsy slot: a little pumpkin patch sprouting at its feet.
        .slot("pumpkin_patch", ("pumpkins", 26))
        .build()
    ),
    "fairy_door": (
        _Build("fairy_door", "whimsy", 54, unlock_level=6)
        .blurb("Set into the base of a tree. Knock gently; you might be expected.")
        .names("The Wee Door", "Thistledown", "Hollow Gate", "Pixie's Rest")
        .variants("acorn", "toadstool", "rosewood")
        .ladder(_growth_ladder(66))
        .slot("glow", ("glow", 28))
        .slot("path", ("path", 30))
        # Evolution fork: a moss-framed door, a gilded royal door, or a starlit threshold.
        .form(
            *_form_fork(
                66, ("mossy_door", 4.0, 0), ("royal_door", 4.3, 1), ("starlit_door", 4.6, 2)
            )
        )
        # New themed additive whimsy slot: a tiny welcome mat on the doorstep.
        .slot("doorstep", ("welcome_mat", 26))
        .build()
    ),
    "hammock": (
        _Build("hammock", "whimsy", 64, unlock_level=7)
        .blurb("Strung between two posts for the fine art of doing nothing, beautifully.")
        .names("The Lazy Sway", "Siesta", "Sunday Swing", "Daydream")
        .variants("striped", "canvas", "rainbow")
        .ladder(_growth_ladder(80))
        .slot("occupant", ("cat", 30), ("napper", 34))
        .slot("lights", ("lights", 36))
        # Evolution fork: a gently-swinging garden swing seat, or a shaded canopy hammock.
        .form(*_form_fork(80, ("garden_swing", 4.0, 0), ("canopy_hammock", 4.4, 2)))
        # New themed additive whimsy slot: a little side table with a cool drink within reach.
        .slot("side_table", ("lemonade", 28))
        .build()
    ),
    "tea_cart": (
        _Build("tea_cart", "whimsy", 120, unlock_level=12)
        .blurb("A wandering little cart of tea and tiny cakes. The garden's quiet luxury.")
        .names("The Teapot", "Sweet Trolley", "Earl's Cart", "Biscuit Wagon")
        .variants("rose", "mint", "midnight")
        .ladder(_growth_ladder(150))
        .slot("lights", ("lights", 48))
        .slot("cat", ("cat", 40))
        # Evolution fork: a festive garden-party spread, a refined patisserie of pastries, or a
        # tiered high-tea service.
        .form(
            *_form_fork(
                150, ("garden_party", 3.8, 0), ("patisserie", 4.1, 1), ("high_tea", 4.4, 2)
            )
        )
        # New themed additive whimsy slot: a plate of dainty macarons on the cart.
        .slot("treats", ("macarons", 44))
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


class NothingToReset(Exception):
    """The item has no customizations to reset — a no-op, so no fee is charged (ADR-0019)."""


class SanctuaryConflictError(Exception):
    """A concurrent write to the same user's garden collided on a unique constraint
    (position/cell). The caller should retry; the route maps this to 409, not 500."""


def _lock_user_garden(db: DBSession, user_id: uuid.UUID) -> None:
    """Serialize concurrent *writes* to one user's garden by taking a transaction-scoped
    PostgreSQL advisory lock keyed on the user. The lock is held until the surrounding
    transaction commits/rolls back, so it spans the read-compute-write of a single
    mutating method while never blocking writes for *other* users. SQLAlchemy autobegins
    a transaction on first use, so this lock reliably covers the subsequent reads + flush.

    Keys the lock on an int8 hash (`hashtextextended`, 64-bit) rather than `hashtext`'s
    int4: a 32-bit space makes cross-user hash collisions plausible, which would needlessly
    serialize two *different* users against each other. int8 makes that negligible. Same-user
    serialization (the intended behaviour) is unaffected.
    """
    key = func.pg_advisory_xact_lock(func.hashtextextended(str(user_id), 0))
    db.execute(select(key))


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

    Reads the lightweight `get_wallet_basis` (the same XP core as the dashboard, without
    the heatmap / this-week / quest-list work) rather than the full `get_stats`, so a
    sanctuary interaction doesn't pay for blocks it would only discard.
    """
    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    return basis.level * COINS_PER_LEVEL, basis.level, basis.current_streak


def _reset_fees(db: DBSession, user_id: uuid.UUID) -> int:
    """The user's cumulative Sanctuary upgrade-reset fees (ADR-0019), subtracted from the
    otherwise fully-derived balance so each reset costs real coins. The one stored economy
    figure; 0 for users who've never reset (and the column's server_default for legacy rows).
    """
    fees = db.execute(
        select(User.sanctuary_reset_fees).where(User.id == user_id)
    ).scalar_one_or_none()
    return int(fees or 0)


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
    plantings: list[SanctuaryPlanting],
    coins_earned: int,
    level: int,
    streak: int,
    reset_fees: int = 0,
) -> SanctuaryScene:
    # The balance is derived from holdings minus the one stored economy figure — the
    # cumulative upgrade-reset fees (ADR-0019) — then clamped ≥ 0 (legacy/large gardens
    # may show 0). reset_fees is monotonic, so it never retroactively raises the balance.
    balance = max(0, coins_earned - _spent(plantings) - reset_fees)
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
                # Cosmetic personalization (ADR-0015) — never affects the derived balance.
                name=p.name,
                note=p.note,
                favorite=bool(p.favorite),
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
            blurb=item.blurb,
            # The item's pool of charming example names, surfaced as an optional naming
            # suggestion in the buy UI (placeholder + shuffle, ADR-0015). Cosmetic only.
            suggested_names=list(item.suggested_names),
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
    return _build_scene(
        _load(db, user_id), coins_earned, level, streak, _reset_fees(db, user_id)
    )


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
    # Serialize concurrent writes for this user so the affordability check + insert below
    # are atomic against a parallel buy/customize (no double-spend, no position/cell race).
    _lock_user_garden(db, user_id)
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
    reset_fees = _reset_fees(db, user_id)
    if coins_earned - _spent(plantings) - reset_fees < price:
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
            # Optional plaque set at purchase (ADR-0015); already trimmed/capped/empty→None
            # by the schema. Cosmetic only — it never affects the price charged above.
            name=data.name,
        )
    )
    try:
        db.commit()
    except IntegrityError as err:  # lost a race on uq position/cell despite the lock
        db.rollback()
        raise SanctuaryConflictError(item.key) from err
    return _build_scene(_load(db, user_id), coins_earned, level, streak, reset_fees)


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
    # Lock FIRST — before reading the target row — so the affordability math *and* the
    # `customizations` map we merge onto are read under the lock. A concurrent customize of
    # the same planting otherwise reads a stale pre-lock snapshot and last-writer-wins
    # clobbers the whole JSON column (+ mischarges). The lock is per-user and txn-scoped.
    _lock_user_garden(db, user_id)
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
    # Read the row's customizations UNDER the lock so the merge below is onto fresh state.
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
    reset_fees = _reset_fees(db, user_id)
    if coins_earned - _spent(plantings) - reset_fees < net_cost:
        raise InsufficientCoins(row.item_key)
    updated = dict(current)
    updated[slot.key] = option.key
    row.customizations = updated
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise SanctuaryConflictError(row.item_key) from err
    return _build_scene(_load(db, user_id), coins_earned, level, streak, reset_fees)


def personalize(
    db: DBSession,
    user_id: uuid.UUID,
    planting_id: uuid.UUID,
    data: PersonalizeRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SanctuaryScene | None:
    """Set/clear an owned item's cosmetic personalization — its name (plaque), note, and
    favourite flag (ADR-0015). Returns None if the item isn't the caller's (→ 404).

    Partial update: only fields *present* in the request are changed, so the UI can rename
    without disturbing the note. An explicit null (or empty/whitespace, normalised to None
    by the schema) clears name/note. Purely cosmetic — never costs coins or moves the item,
    so the derived balance (ADR-0011) is untouched (the scene is rebuilt only to echo the
    update + current balance back to the client).
    """
    # Lock FIRST — before reading the row — so the partial update merges onto state read
    # under the lock, not a stale pre-lock snapshot (consistent with the other mutators).
    _lock_user_garden(db, user_id)
    row = db.execute(
        select(SanctuaryPlanting).where(
            SanctuaryPlanting.id == planting_id, SanctuaryPlanting.user_id == user_id
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    fields = data.model_fields_set
    if "name" in fields:
        row.name = data.name
    if "note" in fields:
        row.note = data.note
    if "favorite" in fields and data.favorite is not None:
        row.favorite = data.favorite
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise SanctuaryConflictError(row.item_key) from err
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    return _build_scene(
        _load(db, user_id), coins_earned, level, streak, _reset_fees(db, user_id)
    )


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
    # Lock FIRST — before reading the target row — so `row.cell`, the occupant lookup, and
    # the swap all read fresh state under the lock. Reading the row before the lock would let
    # a concurrent move read a stale source cell and collide on uq(user_id, cell). The lock
    # is per-user and txn-scoped (never blocks other users).
    _lock_user_garden(db, user_id)
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
        try:
            if occupant is None:
                row.cell = data.cell
            else:
                # Swap: park the moving row on a temporary sentinel cell (out of the
                # addressable range, so it can never collide with a real cell), flush, then
                # place both.
                row.cell = -1
                db.flush()
                occupant.cell = source_cell
                db.flush()
                row.cell = data.cell
            db.commit()
        except IntegrityError as err:
            db.rollback()
            raise SanctuaryConflictError(row.item_key) from err

    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    return _build_scene(
        _load(db, user_id), coins_earned, level, streak, _reset_fees(db, user_id)
    )


def reset_upgrades(
    db: DBSession,
    user_id: uuid.UUID,
    planting_id: uuid.UUID,
    *,
    today: date,
    tz: str = "UTC",
) -> SanctuaryScene | None:
    """Reset an owned item's customizations back to its base form for a flat fee (ADR-0019).

    Clears `row.customizations` to `{}` (the base form) but leaves the `variant` intact — a
    variant is the *purchased base form*, not an "upgrade". The sunk customization cost is
    refunded via the derived balance (the holding now spends only its buy + variant + its
    progressive surcharge), minus a flat SANCTUARY_RESET_FEE accumulated on the user so the
    fee persists in the no-ledger model (and reset-churn is strictly coin-negative).

    Returns None if the item isn't the caller's (→ 404). Raises NothingToReset if the item
    has no customizations (a no-op must not be charged a fee). On a unique-constraint
    collision the commit rolls back and raises SanctuaryConflictError (→ 409), as the other
    mutators do.
    """
    # Lock FIRST — before reading the target row — so the customizations check, the clear,
    # and the fee increment all happen under the per-user, txn-scoped advisory lock. A
    # concurrent reset of the same item otherwise reads a stale snapshot and could charge the
    # fee twice for one clear. Consistent with customize()/move()/personalize().
    _lock_user_garden(db, user_id)
    row = db.execute(
        select(SanctuaryPlanting).where(
            SanctuaryPlanting.id == planting_id, SanctuaryPlanting.user_id == user_id
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    # Read the customizations UNDER the lock. Nothing to reset → no-op: do not charge a fee.
    if not _customizations(row):
        raise NothingToReset(str(planting_id))
    user = db.execute(select(User).where(User.id == user_id)).scalar_one()
    row.customizations = {}
    # Persist the flat fee on the user (the one stored economy figure). Monotonic, so it
    # never retroactively raises the balance; the cleared customizations' refund nets against
    # it, leaving the reset a real, fee-sized coin cost.
    user.sanctuary_reset_fees = (user.sanctuary_reset_fees or 0) + SANCTUARY_RESET_FEE
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise SanctuaryConflictError(row.item_key) from err
    coins_earned, level, streak = _wallet(db, user_id, today=today, tz=tz)
    return _build_scene(
        _load(db, user_id), coins_earned, level, streak, _reset_fees(db, user_id)
    )

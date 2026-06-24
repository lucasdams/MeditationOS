"""Spirit response/request schemas (docs/design/spirit.md, ADR-0022, ADR-0023).

The Spirit is a single living companion grown from practice. Its state is *maximally
computed* on read (ADR-0009/0011): only the chosen `path`, optional `name`, and owned
`cosmetics` are stored; stage, bond, needs, and coins are all derived. ADR-0023 makes
the `path` USER-CHOSEN (set once via `POST /spirit/choose`, NULL until then) instead of
auto-detected from the practice mix, and replaces the single `daily_glow` with THREE named
`needs` (`nourished` / `rested` / `joyful`), each a tier + factor over a rolling window,
plus an overall `condition` derived from the weakest need (so the UI can render one
summary look).

The writes: choose the creature once (`POST /spirit/choose`), buy/apply a cosmetic
(`POST /spirit/cosmetics`), set/clear the nickname (`PATCH /spirit`), and awaken a new spark
at radiant (`POST /spirit/awaken`). The cosmetics catalog state and the retired collection
are part of the read shape too.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas._validators import _capped_blank_to_none

# The nickname is a short label, capped server-side regardless of any client cap. Empty/
# whitespace → None (clears it); over-length → 422.
SPIRIT_NAME_MAX_LENGTH = 40

# A trimmed, length-capped optional nickname. Empty/whitespace → None; over-length → 422.
SpiritName = Annotated[
    str | None, BeforeValidator(_capped_blank_to_none(SPIRIT_NAME_MAX_LENGTH))
]


class SpiritNeed(BaseModel):
    """One tended need (ADR-0023) — a demanding, visual-only care signal derived from the
    activity log over a rolling window.

    `tier` is one of `thriving | content | restless | unwell` (best → worst); `factor` is a
    0..1 brightness/vibrancy multiplier on a concave curve. The three needs are `nourished`
    (the chosen creature's signature practice), `rested` (practice rhythm / consistency), and
    `joyful` (practice variety). GUARDRAIL: advisory/visual only — needs never affect stage,
    level, coins, cosmetics, or the collection (those stay derived from earned XP and remain
    monotonic). A pathless spark (no creature chosen) reports neutral, content-ish needs."""

    tier: str  # thriving | content | restless | unwell
    factor: float  # 0..1 vibrancy multiplier (concave); never reduces progress


class SpiritNeeds(BaseModel):
    """The active creature's three tended needs (ADR-0023), replacing the single `daily_glow`.

    - `nourished` — the chosen path's SIGNATURE practice (the identity need): stillness ←
      meditation minutes, breath ← resonance-breathing minutes, heart ← gratitude + journal.
    - `rested` — practice rhythm / consistency: recent active days and the current streak.
    - `joyful` — practice variety: how many distinct practice types were done recently.

    All three are visual-only (the guardrail) and a pathless spark reports neutral defaults."""

    nourished: SpiritNeed
    rested: SpiritNeed
    joyful: SpiritNeed


class SpiritCondition(BaseModel):
    """The active creature's OVERALL care state (ADR-0023) — derived from the weakest of the
    three `needs`, so the frontend can render one summary look without inspecting each need.

    `tier` is one of `thriving | content | restless | unwell` (best → worst, = the worst need's
    tier); `factor` is the corresponding 0..1 vibrancy multiplier. GUARDRAIL: advisory/visual
    only — it never affects stage, level, coins, cosmetics, or the collection (those stay
    derived from earned XP and remain monotonic). A pathless spark reports a neutral default."""

    tier: str  # thriving | content | restless | unwell (the weakest need's tier)
    factor: float  # 0..1 vibrancy multiplier (concave); never reduces progress


class SpiritBond(BaseModel):
    """A friendly level read-out — the same level + XP-into-level the wallet basis exposes,
    surfaced as the spirit's "bond" with the practitioner."""

    level: int  # the user's level (from earned XP — monotonic)
    xp_into_level: int  # XP accumulated within the current level
    xp_for_next: int  # XP needed to reach the next level


class SpiritSlotOption(BaseModel):
    """One option inside a cosmetic slot, with its cost and current state — the same shape
    the Sanctuary customize panel uses (calm, not pushy)."""

    option: str
    cost: int  # coins to apply this option
    unlocked: bool  # level requirement met
    unlock_hint: str | None  # what's needed to unlock (None when unlocked)
    affordable: bool  # the current balance covers the (net) cost
    applied: bool  # this option is the one currently on the spirit


class SpiritAvailableSlot(BaseModel):
    """A cosmetic axis for the active spirit: the options to mix and match."""

    slot: str
    applied: str | None  # the option currently applied in this slot (None if none)
    options: list[SpiritSlotOption]


class RetiredSpirit(BaseModel):
    """A past spirit in the collection — a radiant companion retired when its successor was
    awakened. Kept forever (the long-term replay loop). Cosmetic read-out only."""

    id: str
    stage: str  # the stage it retired at (radiant, in practice)
    path: str | None  # its committed path (stillness | breath | heart), or None
    name: str | None  # its nickname, if it had one


class SpiritState(BaseModel):
    """The active spirit's computed state. Forbids extra fields so the response stays a
    stable, explicit contract. The `available` catalog state and `collection` are additive
    (steps 5 + 6) — existing fields are unchanged."""

    model_config = ConfigDict(extra="forbid")

    stage: str  # spark | wisp | fledgling | ascendant | radiant (pure function of level)
    path: str | None  # the CHOSEN creature (stillness | breath | heart); NULL until chosen
    name: str | None  # the active spirit's nickname, if set (so the UI can pre-fill / display)
    bond: SpiritBond  # level + XP-into-level + XP-for-next
    needs: SpiritNeeds  # the three tended needs (nourished / rested / joyful); visual-only
    condition: SpiritCondition  # overall care state = the weakest need; visual-only (ADR-0023)
    coins: int  # level × COINS_PER_LEVEL − Σ cosmetics spent, clamped ≥ 0
    cosmetics: dict[str, str]  # owned {slot: option} (empty until cosmetics ship)
    available: list[SpiritAvailableSlot]  # the cosmetics catalog with per-option state
    collection: list[RetiredSpirit]  # past (retired) spirits, kept forever


class ChoosePathRequest(BaseModel):
    """Choose the active creature once (ADR-0023). `path` is the internal enum value
    (`stillness | breath | heart`; the UI relabels them peaceful / wrathful / loving). Only
    settable while the active spirit is pathless — a re-choose is a 409, an unknown value a
    422. Forbids extra fields."""

    model_config = ConfigDict(extra="forbid")

    path: Literal["stillness", "breath", "heart"]


class CosmeticsRequest(BaseModel):
    """Buy/apply a cosmetic option to a slot on the active spirit. Forbids extra fields."""

    model_config = ConfigDict(extra="forbid")

    slot: str
    option: str


class RenameRequest(BaseModel):
    """Set or clear the active spirit's nickname (cosmetic; never changes coins). An empty/
    whitespace/null name clears it; over-length → 422. Forbids extra fields."""

    model_config = ConfigDict(extra="forbid")

    name: SpiritName = None

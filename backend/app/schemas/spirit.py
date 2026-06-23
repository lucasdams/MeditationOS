"""Spirit response/request schemas (docs/design/spirit.md, ADR-0022).

The Spirit is a single living companion grown from practice. Its state is *maximally
computed* on read (ADR-0009/0011): only the committed `path`, optional `name`, and owned
`cosmetics` are stored; stage, bond, daily glow, and coins are all derived from the user's
earned-XP level. The read shape also carries `path_lean` — the suggested path computed from
the lifetime practice mix — alongside the committed `path` (NULL until it crystallizes at the
commit stage).

Steps 5 + 6 add the writes: buy/apply a cosmetic (`POST /spirit/cosmetics`), set/clear the
nickname (`PATCH /spirit`), and awaken a new spark at radiant (`POST /spirit/awaken`). The
read shape grows additively — the cosmetics catalog state and the retired collection — so
existing fields stay a stable contract.
"""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas._validators import _capped_blank_to_none

# The nickname is a short label, capped server-side regardless of any client cap. Empty/
# whitespace → None (clears it); over-length → 422.
SPIRIT_NAME_MAX_LENGTH = 40

# A trimmed, length-capped optional nickname. Empty/whitespace → None; over-length → 422.
SpiritName = Annotated[
    str | None, BeforeValidator(_capped_blank_to_none(SPIRIT_NAME_MAX_LENGTH))
]


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
    path: str | None  # committed path (stillness | breath | heart); NULL until commit
    path_lean: str  # suggested path from lifetime practice mix; the lean shown before commit
    bond: SpiritBond  # level + XP-into-level + XP-for-next
    daily_glow: float  # brightness factor in [GLOW_FLOOR, 1.0] from recent practice
    coins: int  # level × COINS_PER_LEVEL − Σ cosmetics spent, clamped ≥ 0
    cosmetics: dict[str, str]  # owned {slot: option} (empty until cosmetics ship)
    available: list[SpiritAvailableSlot]  # the cosmetics catalog with per-option state
    collection: list[RetiredSpirit]  # past (retired) spirits, kept forever


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

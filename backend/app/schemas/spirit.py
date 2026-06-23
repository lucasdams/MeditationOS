"""Spirit response schemas (docs/design/spirit.md, ADR-0022).

The Spirit is a single living companion grown from practice. Its state is *maximally
computed* on read (ADR-0009/0011): only the committed `path`, optional `name`, and owned
`cosmetics` are stored; stage, bond, daily glow, and coins are all derived from the user's
earned-XP level. Step 1 exposes the read shape only — no writes, no path branching.
"""

from pydantic import BaseModel, ConfigDict


class SpiritBond(BaseModel):
    """A friendly level read-out — the same level + XP-into-level the wallet basis exposes,
    surfaced as the spirit's "bond" with the practitioner."""

    level: int  # the user's level (from earned XP — monotonic)
    xp_into_level: int  # XP accumulated within the current level
    xp_for_next: int  # XP needed to reach the next level


class SpiritState(BaseModel):
    """The active spirit's computed state. Forbids extra fields so the response stays a
    stable, explicit contract."""

    model_config = ConfigDict(extra="forbid")

    stage: str  # spark | wisp | fledgling | ascendant | radiant (pure function of level)
    path: str | None  # committed path (stillness | breath | heart); NULL until commit
    bond: SpiritBond  # level + XP-into-level + XP-for-next
    daily_glow: float  # brightness factor in [GLOW_FLOOR, 1.0] from recent practice
    coins: int  # level × COINS_PER_LEVEL − Σ cosmetics spent, clamped ≥ 0
    cosmetics: dict[str, str]  # owned {slot: option} (empty until cosmetics ship)

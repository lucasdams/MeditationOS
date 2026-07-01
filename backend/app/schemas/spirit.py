"""Spirit response/request schemas (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024).

The Spirit is a single living companion grown from practice. Its state is *maximally
computed* on read (ADR-0009/0011): only the chosen `path`, the `name`, the applied
`cosmetics`, and the stored `coins_spent` ledger are persisted; stage, bond, needs, and
coins are all derived. ADR-0023 makes the `path` USER-CHOSEN (set once via
`POST /spirit/choose`, NULL until then) instead of auto-detected from the practice mix, and
replaces the single `daily_glow` with THREE named `needs` (`nourished` / `rested` /
`joyful`), each a tier + factor over a rolling window, plus an overall `condition`. ADR-0032
redefines `condition` as VITALITY — a single headline signal fed by ANY practice — and demotes
the three needs to an informational balance (recent practice mix); see those schemas below.

ADR-0024 makes the name a COMMITTED choice: it is REQUIRED at creation
(`POST /spirit/choose` carries it) and immutable thereafter, changeable only by a paid reset
(`POST /spirit/reset-name`, a flat fee, no refund). The free `PATCH /spirit` rename is gone.

ADR-0027 supersedes ADR-0024's locked upgrades + paid upgrades-reset with a per-slot SKILL TREE:
cosmetics are a COLLECTION you unlock-to-own (`POST /spirit/cosmetics` — charges the option's
cost, owns it forever, auto-equips it) plus a LOADOUT you equip for FREE
(`POST /spirit/cosmetics/equip` — equip an owned option or clear a slot). `cosmetics` is now the
EQUIPPED `{slot: option}` map; the catalog state exposes each option's `tier`, `owned`,
`equipped`, and `unlockable`.

The writes: choose the creature + name once (`POST /spirit/choose`), unlock a cosmetic
(`POST /spirit/cosmetics`), equip/clear an owned one (`POST /spirit/cosmetics/equip`), reset the
name (`POST /spirit/reset-name`), and awaken a new spark at radiant (`POST /spirit/awaken`). The
cosmetics catalog state and the retired collection are part of the read shape too.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas._validators import trimmed_nonblank

# The name is a short label, capped server-side regardless of any client cap. Over-length →
# 422.
SPIRIT_NAME_MAX_LENGTH = 40

# A REQUIRED, trimmed, length-capped name (ADR-0024): empty/whitespace → 422; over-length →
# 422. Used at creation (choose) and on the paid name reset.
SpiritRequiredName = Annotated[
    str, BeforeValidator(trimmed_nonblank(SPIRIT_NAME_MAX_LENGTH))
]


class SpiritNeed(BaseModel):
    """One facet of the companion's recent-practice BALANCE (ADR-0032 — an informational read-out,
    NOT a depleting debt; refines ADR-0031's non-punishing needs, which reversed ADR-0029's survival
    meters).

    Each facet is a 0..1 meter that eases down over `DECAY_DAYS` since it was last fed by the
    relevant practice (or, lighter, a manual tend capped at `TEND_CAP`), but is FLOORED so it never
    drops below a calm tier. `factor` is that 0..1 value; `tier` is its band
    (`thriving | content | restless | unwell`, best → worst) — in practice the worst it ever reads
    is `content`. The three facets are `nourished` (the chosen creature's signature practice),
    `rested` (any sit), and `joyful` (gratitude/journal). They no longer drive the overall look
    (that's now `condition`/Vitality) — a low facet is a gentle "round this out" hint, never a
    warning. A pathless spark reports neutral, content-ish facets."""

    tier: str  # thriving | content | restless | unwell (floored: worst reachable is content)
    factor: float  # 0..1 balance value (eases down over time, floored; never empties)


class SpiritNeeds(BaseModel):
    """The active creature's three-facet recent-practice BALANCE (ADR-0032 — informational, not
    punishing; floored per ADR-0031). A read-out of your recent practice MIX, advisory only: it
    does NOT set the overall look (`condition`/Vitality does) and a low facet is only a gentle
    round-out invitation.

    Each facet eases down over DECAY_DAYS since last fed; the fed time is the most recent of:
    - `nourished` — the chosen path's SIGNATURE practice (the one that BALANCES that dosha):
      stillness (Kapha) ← resonance breathing, breath (Pitta) ← gratitude/journal, heart (Vata)
      ← non-breathing meditation.
    - `rested` — ANY practice session (a sit of any kind).
    - `joyful` — a gratitude or journal entry.

    Practice fills a facet to 1.0; a manual tend tops it up to TEND_CAP. A pathless spark reports
    neutral defaults."""

    nourished: SpiritNeed
    rested: SpiritNeed
    joyful: SpiritNeed


class SpiritCondition(BaseModel):
    """The active creature's OVERALL care state — VITALITY, a.k.a. "cared-for" (ADR-0032, refining
    ADR-0023/0031). Any practice keeps them content: it is fed by ANY practice of ANY kind (any
    sit, a gratitude entry, or a journal entry), decaying off the most-recent such practice and
    FLOORED so the worst it ever reads is `content`. This is NOT the weakest of the three `needs`
    anymore — those are a separate informational balance — so no single facet can drag the overall
    look down.

    `tier` is one of `thriving | content | restless | unwell` (best → worst; floored at `content`);
    `factor` is the corresponding 0..1 vibrancy multiplier. GUARDRAIL: advisory/visual only — it
    never affects stage, level, coins, cosmetics, or the collection (those stay derived from earned
    XP and remain monotonic). A pathless spark reports a neutral default."""

    tier: str  # thriving | content | restless | unwell (Vitality; floored at content)
    factor: float  # 0..1 vibrancy multiplier (concave); never reduces progress


class SpiritBond(BaseModel):
    """A friendly level read-out, surfaced as the spirit's "bond" with the practitioner.

    ADR-0030 ("rebirth from a spark"): `level` is the SPIRIT-LEVEL — this pet's OWN growth, derived
    from the XP earned SINCE `awakened_at` — NOT the dashboard's lifetime level (a separate
    concept). A just-awakened spark is bond level 1 even on a seasoned account; the level then
    climbs with practice done after awakening. For a first/never-died spirit (awakened ≈ account
    start) it equals the lifetime level. Like the lifetime basis it rides EARNED XP (streak-bonus
    XP excluded), so this pet's progress is un-loseable over its own life."""

    level: int  # the SPIRIT-LEVEL (XP earned since awakened_at — this pet's own growth)
    xp_into_level: int  # XP accumulated within the current spirit-level
    xp_for_next: int  # XP needed to reach the next spirit-level


class SpiritSlotOption(BaseModel):
    """One node in a cosmetic slot's skill tree, with its cost and current state (ADR-0027) —
    the same shape the Spirit personalize panel uses (calm, not pushy)."""

    option: str
    cost: int  # coins to UNLOCK this option (equipping an owned option is free)
    unlock_level: int  # the level this option unlocks at (1 = always)
    unlock_hint: str | None  # what's needed to reach unlock_level (None when met)
    tier: int  # the skill-tree tier (1|2|3): tier N>1 needs an owned tier N−1 in the same slot
    affordable: bool  # the current balance covers the unlock cost
    owned: bool  # the spirit owns this option (unlocked, or legacy-equipped)
    equipped: bool  # this option is the one currently shown in its slot
    unlockable: bool  # not owned AND path/level/tier prereqs met (affordability is separate)
    available: bool  # offered to the spirit's chosen path (per-path exclusivity; True = universal)
    exclusive: bool  # the chosen creature's OWN per-path SIGNATURE capstone (vs a universal option)
    need: str  # the need this option FAVOURS (ADR-0026): nourished | rested | joyful


class SpiritAvailableSlot(BaseModel):
    """A cosmetic axis for the active spirit — a small skill tree (ADR-0027). The slot reports
    its currently EQUIPPED option (or null) and is never "locked": owned options equip freely."""

    slot: str
    equipped: str | None  # the option currently equipped in this slot (None if none)
    options: list[SpiritSlotOption]


class SpiritSetBonus(BaseModel):
    """The active spirit's SIGNATURE SET status (ADR-0028) — the endgame achievement of equipping
    every slot's path-exclusive capstone at once. Fully DERIVED from the equipped cosmetics + the
    chosen path (no stored column, no migration); visual/advisory ONLY, like the needs it lifts.

    - `active` — the full set is equipped (all `total` signature slots wearing their signature),
      which grants "Signature radiance": a gentle harmony lift to every need (the ADR-0023/0025/0026
      advisory pattern; never touches stage/level/coins/cosmetics).
    - `kind` — `"signature"` when active, else null (room for future set kinds).
    - `count` / `total` — progress: how many of the `total` signature slots are equipped with their
      signature option. `total` is 7 for a chosen creature; a pathless spark reports `(0, 0)`.
    - `label` — the user-facing name of the bonus ("Signature radiance")."""

    active: bool  # the full signature set is equipped → the harmony lift is on
    kind: str | None  # "signature" when active, else null
    count: int  # signature slots currently equipped with their signature option
    total: int  # signature slots that exist for the chosen path (7 chosen; 0 pathless)
    label: str  # the user-facing bonus name ("Signature radiance")


class RetiredSpirit(BaseModel):
    """A past spirit in the collection — a radiant companion graduated and set free when its
    successor was awakened (ADR-0031 removed the death path, so every retired spirit is a radiant
    graduate). Kept forever (the long-term replay loop). Cosmetic read-out only."""

    id: str
    stage: str  # the stage it retired at (radiant — graduates only)
    path: str | None  # its committed path (stillness | breath | heart), or None
    name: str | None  # its nickname, if it had one
    awakened_at: datetime  # its birth


class SpiritState(BaseModel):
    """The active spirit's computed state. Forbids extra fields so the response stays a
    stable, explicit contract. ADR-0031 ("the companion stops being mortal") removed the survival
    fields (`dead` / `died_at` / `ailing`) — the spirit can never die or be ailing. ADR-0030
    ("rebirth from a spark") keys `stage` and `bond.level` to the SPIRIT-LEVEL (XP since
    `awakened_at` — this pet's own growth), distinct from the dashboard's lifetime level; `coins`
    stays on the lifetime level."""

    model_config = ConfigDict(extra="forbid")

    stage: str  # spark | wisp | fledgling | ascendant | radiant (from the SPIRIT-LEVEL, ADR-0030)
    path: str | None  # the CHOSEN creature (stillness | breath | heart); NULL until chosen
    name: str | None  # the active spirit's nickname, if set (so the UI can pre-fill / display)
    bond: SpiritBond  # SPIRIT-LEVEL (XP since awakened_at) + XP-into-level + XP-for-next
    needs: SpiritNeeds  # the three-facet recent-practice balance (nourished/rested/joyful); floored
    condition: SpiritCondition  # overall care state = VITALITY, fed by any practice (ADR-0032)
    coins: int  # lifetime_level × COINS_PER_LEVEL − coins_spent, clamped ≥ 0 (ADR-0030: lifetime)
    cosmetics: dict[str, str]  # the EQUIPPED loadout {slot: option} (ADR-0027; empty = none)
    available: list[SpiritAvailableSlot]  # the cosmetics skill tree with per-option state
    collection: list[RetiredSpirit]  # past (retired) spirits, kept forever
    set_bonus: SpiritSetBonus  # signature-set status (ADR-0028); derived, visual-only
    awakened_at: datetime  # when this spirit was awakened — its birth


class OptionPreview(BaseModel):
    """One option in a path's read-only skill-tree PREVIEW (the choose page). A flat,
    state-free node — no `owned`/`equipped`/`affordable` (the spirit doesn't exist yet) — just
    what the option IS: its label key, its skill-tree `tier`, what it costs / unlocks at, the
    `need` it favours, and whether it's that path's own path-EXCLUSIVE capstone (`exclusive`)."""

    option: str
    tier: int  # the skill-tree tier (1|2|3) — options are listed tier-ascending
    cost: int  # coins to unlock it
    unlock_level: int  # the level it unlocks at (1 = always)
    need: str  # the need it favours (nourished | rested | joyful)
    exclusive: bool  # this is the path's OWN per-path capstone (its signature tier-3 option)


class SlotPreview(BaseModel):
    """One cosmetic slot in a path's preview — its options ordered by tier (ADR-0027). Only the
    options a given path can ever own appear here: universal options + that path's own
    path-exclusive capstones (other paths' exclusives are excluded)."""

    slot: str
    options: list[OptionPreview]


class ChoosePathRequest(BaseModel):
    """Choose the active creature + name it once (ADR-0023 / ADR-0024). `path` is the internal
    enum value (`stillness | breath | heart`; the UI relabels them as doshas). `name` is
    REQUIRED (empty/whitespace → 422, over-length → 422) and immutable thereafter — changing
    it later needs a paid reset. Only settable while the active spirit is pathless — a
    re-choose is a 409, an unknown path value a 422. Forbids extra fields."""

    model_config = ConfigDict(extra="forbid")

    path: Literal["stillness", "breath", "heart"]
    name: SpiritRequiredName


class CosmeticsRequest(BaseModel):
    """Unlock a cosmetic option into the active spirit's owned collection + auto-equip it
    (ADR-0027). Charges the option's cost. Forbids extra fields."""

    model_config = ConfigDict(extra="forbid")

    slot: str
    option: str


class EquipRequest(BaseModel):
    """Equip an OWNED cosmetic option into its slot, or clear the slot (ADR-0027) — FREE. A
    null `option` clears the slot; a non-null one must be owned and belong to `slot`. Forbids
    extra fields."""

    model_config = ConfigDict(extra="forbid")

    slot: str
    option: str | None = None


class ResetNameRequest(BaseModel):
    """Change the active spirit's name via a PAID reset (ADR-0024). The name is otherwise
    immutable (set once at creation). `name` is REQUIRED and validated like creation
    (empty/whitespace → 422, over-length → 422). Charges a flat fee; no refund. Forbids extra
    fields."""

    model_config = ConfigDict(extra="forbid")

    name: SpiritRequiredName


class TendRequest(BaseModel):
    """A gentle, optional TEND action (ADR-0031): the Feed / Rest / Play buttons. `kind` maps to one
    need — `feed` → nourished, `rest` → rested, `play` → joyful — and tops that need up to TEND_CAP
    (it then eases like practice). An unknown kind → 422. Forbids extra fields. Free; no coins."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["feed", "rest", "play"]

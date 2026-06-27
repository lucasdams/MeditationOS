"""Spirit state — a single living companion grown from practice (docs/design/spirit.md,
ADR-0022, ADR-0023, ADR-0024, ADR-0027, ADR-0029). Get-or-create the active spirit, compute its
read-only state, and write the choose / tend / unlock / equip / name-reset / awaken loop.

Mostly computed (ADR-0009/0011): the stored state is the active spirit row's chosen `path`, the
`name`, the `unlocked` collection + the equipped `cosmetics` loadout (ADR-0027), the `coins_spent`
spend ledger, and — ADR-0029, the Tamagotchi turn — the needs decay anchors: `needs_baseline_at`
(born-fed), the per-need `*_tended_at` stamps, and `died_at`. Stage / bond / coins are still
derived on read (via `dashboard_service.get_wallet_basis`), but ADR-0030 ("rebirth from a spark")
splits which LEVEL each reads:

- **Stage / Bond / unlock-level gates** — derived from the SPIRIT-LEVEL: the XP earned SINCE
  `awakened_at` (this spirit's OWN life), via `get_wallet_basis(..., since=awakened_at)`. So a
  freshly awakened spark starts at level 1 → `spark` and must be RE-GROWN, even on a seasoned
  account; death is a true restart. A pure function of (own-life) level, so it's still monotonic
  over this spirit's life and can't be lost. For a first/never-died spirit (awakened ≈ account
  start) the spirit-level ≈ the lifetime level, so its stage/level are unchanged (no migration).
- **Coins** — `lifetime_level × COINS_PER_LEVEL − coins_spent`, clamped ≥ 0 (see `_coin_balance`).
  ADR-0030 keeps coins on the LIFETIME level (the user's whole journey) — the owner's "keep your
  coin budget" choice — so a young spark holds the full account budget and `coins_spent` resets to
  0 on awaken.
  ADR-0024: the balance comes from the STORED, monotonic `coins_spent` ledger (every upgrade
  and paid reset only ADDS to it; clearing an upgrade never refunds), so a committed choice
  can't be undone for free. Self-contained: this module owns its own `COINS_PER_LEVEL`.
- **Needs** (ADR-0029, supersedes ADR-0023 and the cosmetic modifiers of ADR-0025/0026/0028) —
  THREE SURVIVAL meters (`nourished` / `rested` / `joyful`), each a tier + 0..1 factor that DECAYS
  in real time off the born-fed baseline + the most-recent relevant practice (and a lighter,
  capped manual tend). `nourished` ← the chosen creature's signature practice, `rested` ← any sit,
  `joyful` ← a gratitude/journal entry. The overall **condition** = the weakest need = HEALTH:
  when it hits 0 the spirit is ailing, and after DEATH_DAYS it DIES (`died_at` persisted lazily;
  death is terminal). XP/level/coins stay decoupled from needs, so practice progress is never lost.

ADR-0023 also makes the `path` USER-CHOSEN (set once via `choose_path` while pathless)
instead of auto-detected from the practice mix; the ADR-0022 `path_lean` and commit-on-read
are retired. The active spirit is lazily created (a pathless spark, born fed) on first read, so
both new users and migrated users get one without a heavy backfill.

Steps 5 + 6 add the writes — all user-scoped, default-deny at the route. Mutations serialize
concurrent same-user writes via a per-user, txn-scoped Postgres advisory lock so the
read-compute-write of a cosmetic purchase (or the retire+awaken swap) is atomic against a
parallel request — no double-spend, no two active spirits.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import BREATHING_SESSION_TYPES, Session
from app.models.spirit import Spirit
from app.schemas.spirit import (
    ChoosePathRequest,
    CosmeticsRequest,
    EquipRequest,
    OptionPreview,
    ResetNameRequest,
    RetiredSpirit,
    SlotPreview,
    SpiritAvailableSlot,
    SpiritBond,
    SpiritCondition,
    SpiritNeed,
    SpiritNeeds,
    SpiritSetBonus,
    SpiritSlotOption,
    SpiritState,
)
from app.services import dashboard_service

# ADR-0029 replaced the rolling-window day-bucketing (the old time_utils local_date/zone +
# MIN_PRACTICE_SECONDS helpers) with real-time decay off raw activity timestamps, so those
# local-day helpers are no longer imported here.

# The spirit's own economy constant: coins earned per level. The derived coin balance is
# `level × COINS_PER_LEVEL − coins_spent`, clamped ≥ 0 (see `_coin_balance`).
COINS_PER_LEVEL = 80

# The flat fee for the paid NAME reset (ADR-0024; the upgrades-reset is removed in ADR-0027 —
# equipping owned options is now free). Charged against the coin balance; never refunded.
RESET_COST = 250


def _coin_balance(level: int, coins_spent: int) -> int:
    """The derived coin balance: `level × COINS_PER_LEVEL − coins_spent`, clamped ≥ 0
    (ADR-0024). The balance now comes from the STORED, monotonic spend ledger
    (`spirits.coins_spent`) rather than the sum of applied cosmetics, so undoing/clearing an
    upgrade never refunds its coins. Single source of truth for the formula shared by the read
    state, purchases, and resets."""
    return max(0, level * COINS_PER_LEVEL - coins_spent)

# --- Domain errors (mapped to HTTP in the route layer) ----------------------------------


class UnknownCosmetic(Exception):
    """The requested cosmetic slot or option is not in the catalog → 404."""


class CosmeticLocked(Exception):
    """The option's level requirement isn't met yet → 409."""


class InsufficientCoins(Exception):
    """Not enough coins for this cosmetic / reset → 409."""


class PrerequisiteNotMet(Exception):
    """The option's skill-tree prerequisite isn't met yet (ADR-0027): its tier>1 needs an owned
    option of the tier below in the SAME slot → 409."""


class NotOwned(Exception):
    """An equip targeted an option the spirit doesn't own yet (ADR-0027) → 409. Equipping is
    free but only works on owned options."""


class AlreadyOwned(Exception):
    """An unlock targeted an option the spirit already owns (ADR-0027) → 409. Owned is forever;
    re-unlocking would double-charge, so it's rejected rather than re-equip-for-free here (equip
    is the free path)."""


class PathAlreadyChosen(Exception):
    """The active spirit already has a chosen creature; the choice is once-only → 409."""


class NotRadiant(Exception):
    """Awaken requires the active spirit to be at the radiant stage → 409. (ADR-0029 also lets a
    DEAD spirit awaken — that path checks `died_at`, not this error.)"""


class SpiritDead(Exception):
    """A tend (Feed / Rest / Play) targeted a spirit that has already died (ADR-0029). Death is
    terminal — you must awaken a new spirit. The route maps this to 409."""


class SpiritConflictError(Exception):
    """A concurrent write to the same user's spirit collided on the partial unique index
    (two active spirits). The route maps this to 409, not 500."""


def _lock_user_spirit(db: DBSession, user_id: uuid.UUID) -> None:
    """Serialize concurrent *writes* to one user's spirit by taking a transaction-scoped
    Postgres advisory lock keyed on the user. Held until the surrounding transaction
    commits/rolls back, so it spans the
    read-compute-write of a single mutating method while never blocking writes for *other*
    users. Keyed on an int8 hash (`hashtextextended`) so cross-user collisions are negligible.
    """
    key = func.pg_advisory_xact_lock(func.hashtextextended(str(user_id), 0))
    db.execute(select(key))


# --- Evolution stages (tunable level bands) ---------------------------------------------
#
# Five stages derived from the user's level (level comes from earned XP, so it is monotonic
# and shared with the coin wallet). Stage = the highest band whose level threshold ≤ the
# user's level. A pure function of level — never stored, never lost. Gates per the design
# doc; retuning them needs no migration. Ordered low → high.
STAGE_BANDS: tuple[tuple[str, int], ...] = (
    ("spark", 1),
    ("wisp", 3),
    ("fledgling", 7),
    ("ascendant", 14),
    ("radiant", 24),
)


def stage_for_level(level: int) -> str:
    """The evolution stage a level falls into — the highest band whose threshold ≤ level.

    Pure function of level (monotonic, never stored). Levels below the first gate still map
    to the first stage (spark), so there is always a stage.
    """
    stage = STAGE_BANDS[0][0]
    for name, threshold in STAGE_BANDS:
        if level >= threshold:
            stage = name
        else:
            break
    return stage


# --- The three creatures (chosen, not auto-detected) ------------------------------------
#
# The three creatures the user can choose (docs/design/spirit.md, ADR-0023). The internal enum
# values are kept stable; the UI relabels them as Ayurvedic doshas. Each dosha's SIGNATURE
# practice is the one that BALANCES it (Ayurveda balances by OPPOSITES), not the one that
# matches its element:
#   stillness → Kapha (earth/water, heavy)   — balanced by resonance BREATHING (energizing)
#   breath    → Pitta (fire/water, intense)  — balanced by GRATITUDE + JOURNALING (cooling)
#   heart     → Vata  (air/ether, scattered) — balanced by MEDITATION (grounding)
#
# ADR-0023 retires ADR-0022's practice-auto-detected path and commit-on-read: the path is now
# CHOSEN ONCE by the user (via `choose_path`) and stored in the same `spirits.path` column. A
# fresh spark is pathless (path IS NULL) until the user picks.
STILLNESS = "stillness"
BREATH = "breath"
HEART = "heart"

# Each creature's preferred practice — the only practice that keeps it in good condition.
_CHOOSABLE_PATHS: frozenset[str] = frozenset({STILLNESS, BREATH, HEART})


# --- The three needs (ADR-0029 survival meters) + need keys -------------------------------
#
# The three need KEYS (also the catalog `need` affinity tag, ADR-0026 → a display tag only under
# ADR-0029). Kept as bare string constants so the catalog, the needs read, and the schema all
# agree on the exact spelling.
NOURISHED = "nourished"
RESTED = "rested"
JOYFUL = "joyful"

# The full set of need keys, in display order — the valid `need` affinity values for the catalog
# (a display tag under ADR-0029) and the keys the schema/needs read agree on.
NEED_KEYS: tuple[str, ...] = (NOURISHED, RESTED, JOYFUL)

# ADR-0029 makes the three needs SURVIVAL meters that decay in real time (see the decay block
# below). Each is still reported as a tier (thriving → content → restless → unwell) + a 0..1
# factor, but the factor is now the decayed VALUE, not a rolling activity-day count. The tier is
# banded from that value via NEED_TIERS' factor thresholds (`_tier_for_factor`). What feeds each
# need (ADR-0029):
#   nourished — the chosen creature's SIGNATURE practice (the balancing one).
#   rested    — ANY practice session (a sit of any kind).
#   joyful    — a gratitude or journal entry.

# Tiers, best → worst.
CONDITION_THRIVING = "thriving"
CONDITION_CONTENT = "content"
CONDITION_RESTLESS = "restless"
CONDITION_UNWELL = "unwell"

# Tier order, worst → best, so the overall condition can pick the WEAKEST need by index.
_TIER_RANK: dict[str, int] = {
    CONDITION_UNWELL: 0,
    CONDITION_RESTLESS: 1,
    CONDITION_CONTENT: 2,
    CONDITION_THRIVING: 3,
}

# The factor → tier band thresholds (`_tier_for_factor`): the best tier whose factor ≤ a need's
# value. ADR-0029 reuses only the factor column (the middle `min_count` is now vestigial — kept so
# the tuple shape stays stable). A value at/above 1.0 → thriving, ≥0.8 → content, ≥0.6 → restless,
# anything lower (down to 0) → unwell, the natural floor for a depleted (or dead-bound) need.
NEED_TIERS: tuple[tuple[str, int, float], ...] = (
    (CONDITION_THRIVING, 5, 1.0),
    (CONDITION_CONTENT, 3, 0.8),
    (CONDITION_RESTLESS, 1, 0.6),
    (CONDITION_UNWELL, 0, 0.4),
)

# A pathless spark (no creature chosen yet) has no care requirement — every need reports a
# neutral, content-ish default rather than declining.
_NEUTRAL_CONDITION_TIER = CONDITION_CONTENT
_NEUTRAL_CONDITION_FACTOR = 0.8

# --- ADR-0029: real-time decay + sickness/death (the Tamagotchi turn) ---------------------
#
# Needs no longer read a rolling activity-day count off the log (ADR-0023); each is a 0..1 meter
# that FALLS ON A CLOCK. Two ways to feed it:
#   - PRACTICE fills it to 1.0. The "last fed by practice" time is the most recent relevant
#     activity (nourished ← the dosha's signature practice, rested ← any sit, joyful ←
#     gratitude/journal), floored at `needs_baseline_at` (the born-fed anchor).
#   - A TEND (Feed / Rest / Play) tops it up to TEND_CAP. Stored as a per-need `*_tended_at`.
# A need's value = `max(practice_value, tend_value)`, each = cap − elapsed_days/DECAY_DAYS, clamped.
# There is NO floor — a need can reach 0 (the old non-punishing floor is intentionally gone).
#
# Overall HEALTH = the weakest need. When it hits 0 the spirit is AILING; if it stays ailing for
# DEATH_DAYS it DIES (~5 days of total neglect). Both onsets are computable from the fed timestamps
# (so "ailing" needs no stored column); `died_at` is persisted lazily on the first read that detects
# death, freezing it (death is terminal — practice/tend can't revive a dead spirit).
DECAY_DAYS = 3.0  # full → empty over this many days since a need was last fed
TEND_CAP = 0.6  # a manual tend tops a need up only to here (practice fills to 1.0)
DEATH_DAYS = 2.0  # days a spirit stays ailing (health 0) before it dies

# --- Per-item need affinity (ADR-0026 → ADR-0029) -----------------------------------------
#
# Each catalog option still declares the ONE need it FAVOURS (its `need`), used by the shop tags
# and the choose-page preview. ADR-0029 REMOVES the gameplay effect of that affinity: cosmetics no
# longer modify needs at all (no passive lift, no buy-boost) — needs are now the survival meters,
# driven only by practice + tending. The affinity is kept purely as a display tag (`_option_need`),
# and `last_pampered_need` is still STAMPED on unlock for forward-compat, but nothing reads it for
# the needs computation anymore.
#
# Default need affinity for any catalog option missing an explicit `need` (a safety net — every
# real option gets an explicit one; see SPIRIT_COSMETICS_CATALOG and the catalog-coverage test).
DEFAULT_ITEM_NEED = JOYFUL

# --- Signature SET BONUS status (ADR-0028 → ADR-0029) -------------------------------------
#
# Each chosen creature has exactly ONE path-exclusive (tier-3) capstone per slot — its SIGNATURE
# option for that slot. Equipping ALL of them (the full SIGNATURE SET) lights "Signature radiance".
# ADR-0029 REMOVES its needs effect (the harmony lift is gone — cosmetics are purely cosmetic now);
# the `set_bonus` STATUS object stays as a visual flourish only (active/kind/count/total/label),
# fully DERIVED from the equipped cosmetics + path (no stored flag, no migration).
SET_BONUS_KIND = "signature"
SET_BONUS_LABEL = "Signature radiance"


def _tier_for_factor(
    factor: float, tiers: tuple[tuple[str, int, float], ...] = NEED_TIERS
) -> str:
    """Map a 0..1 factor back to a tier name using NEED_TIERS' factor thresholds — the best
    (highest) tier whose factor ≤ the given factor. ADR-0029 uses this to band each need's decayed
    value into a tier (so a value below the unwell threshold reads `unwell`, the floor). The tiers
    are ordered best → worst, so we walk from the worst up and keep the best one we still meet."""
    chosen = tiers[-1][0]  # the floor tier (unwell)
    for tier, _min_count, tier_factor in reversed(tiers):
        if factor >= tier_factor:
            chosen = tier
    return chosen


# --- ADR-0029: latest-activity-timestamp queries (the "last fed by practice" per need) -----
#
# Unlike the ADR-0023 helpers above (which count distinct active DAYS in a window), the decay
# model needs the single MOST-RECENT matching timestamp per need. Each is a small user-scoped
# query returning the latest `occurred_at` / `created_at`, or None when there's no such activity.


def _last_signature_practice_at(
    db: DBSession, path: str, user_id: uuid.UUID
) -> datetime | None:
    """The most recent timestamp of the chosen creature's SIGNATURE practice — what feeds
    `nourished` (ADR-0029). The signature is the practice that BALANCES that dosha (by opposites):
    stillness (Kapha) ← resonance/energizing breathing; heart (Vata) ← non-breathing meditation;
    breath (Pitta) ← the latest of a gratitude OR a journal entry. None if never done."""
    if path in (STILLNESS, HEART):
        is_breathing = path == STILLNESS
        return db.execute(
            select(func.max(Session.occurred_at)).where(
                Session.user_id == user_id,
                (Session.type.in_(BREATHING_SESSION_TYPES))
                if is_breathing
                else (Session.type.notin_(BREATHING_SESSION_TYPES)),
            )
        ).scalar_one_or_none()

    # breath (Pitta) → the most recent gratitude OR journal entry (its cooling balancing practice).
    last_grat = db.execute(
        select(func.max(GratitudeEntry.created_at)).where(
            GratitudeEntry.user_id == user_id
        )
    ).scalar_one_or_none()
    last_journal = db.execute(
        select(func.max(Journal.created_at)).where(Journal.user_id == user_id)
    ).scalar_one_or_none()
    return _latest(last_grat, last_journal)


def _last_any_session_at(db: DBSession, user_id: uuid.UUID) -> datetime | None:
    """The most recent timestamp of ANY practice session (a sit of any kind) — what feeds
    `rested` (ADR-0029). None if the user has never sat."""
    return db.execute(
        select(func.max(Session.occurred_at)).where(Session.user_id == user_id)
    ).scalar_one_or_none()


def _last_reflection_at(db: DBSession, user_id: uuid.UUID) -> datetime | None:
    """The most recent timestamp of a gratitude OR journal entry — what feeds `joyful`
    (ADR-0029). None if the user has never written either."""
    last_grat = db.execute(
        select(func.max(GratitudeEntry.created_at)).where(
            GratitudeEntry.user_id == user_id
        )
    ).scalar_one_or_none()
    last_journal = db.execute(
        select(func.max(Journal.created_at)).where(Journal.user_id == user_id)
    ).scalar_one_or_none()
    return _latest(last_grat, last_journal)


def _neutral_need() -> SpiritNeed:
    """A pathless spark's neutral, content-ish need (no care requirement until a creature is
    chosen)."""
    return SpiritNeed(tier=_NEUTRAL_CONDITION_TIER, factor=_NEUTRAL_CONDITION_FACTOR)


def _as_aware(stamp: datetime | None) -> datetime | None:
    """Normalize a stored timestamp to tz-aware UTC. The DB stores timestamptz (tz-aware), but a
    naive value can sneak in via some test paths — treat a naive stamp as UTC so the decay math is
    always over comparable, aware datetimes. None passes through."""
    if stamp is None:
        return None
    return stamp if stamp.tzinfo is not None else stamp.replace(tzinfo=UTC)


def _latest(*stamps: datetime | None) -> datetime | None:
    """The most recent of the given (possibly-None) timestamps, normalized to aware UTC. None
    when every argument is None — used to fold gratitude+journal into one 'last reflection'."""
    aware = [s for s in (_as_aware(s) for s in stamps) if s is not None]
    return max(aware) if aware else None


def _elapsed_days(now: datetime, then: datetime) -> float:
    """Fractional days elapsed from `then` to `now` (both tz-aware). Negative (a future `then`,
    e.g. clock skew) is clamped to 0 so a stamp 'ahead of now' reads as just-fed, not over-full."""
    seconds = (now - then).total_seconds()
    return max(0.0, seconds) / 86400.0


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _need_value_and_zero_time(
    now: datetime,
    practice_fed_at: datetime,
    tended_at: datetime | None,
) -> tuple[float, datetime]:
    """One need's current 0..1 value AND the instant it reaches 0 (ADR-0029).

    - `practice_value = clamp(1 − elapsed(now, practice_fed_at) / DECAY_DAYS, 0, 1)` — practice
      fills to 1.0 and decays over DECAY_DAYS.
    - `tend_value = clamp(TEND_CAP − elapsed(now, tended_at) / DECAY_DAYS, 0, TEND_CAP)` when the
      need was tended, else 0.0 — a tend tops up only to TEND_CAP and decays at the same rate.
    - `value = max(practice_value, tend_value)` — the stronger of the two.

    `zero_time` = the latest instant either source still has value left:
    `max(practice_fed_at + DECAY_DAYS, (tended_at + TEND_CAP·DECAY_DAYS) if tended)` — the moment
    this need's `value` hits 0 (used to derive ailing-onset / death). Both are pure functions of
    the fed timestamps, so health/ailing/death are computable without a stored 'ailing' column."""
    decay = timedelta(days=DECAY_DAYS)
    practice_value = _clamp(1.0 - _elapsed_days(now, practice_fed_at) / DECAY_DAYS, 0.0, 1.0)
    practice_zero = practice_fed_at + decay

    if tended_at is not None:
        tend_value = _clamp(
            TEND_CAP - _elapsed_days(now, tended_at) / DECAY_DAYS, 0.0, TEND_CAP
        )
        tend_zero = tended_at + timedelta(days=TEND_CAP * DECAY_DAYS)
        return max(practice_value, tend_value), max(practice_zero, tend_zero)

    return practice_value, practice_zero


def _need_from_value(value: float) -> SpiritNeed:
    """Wrap a 0..1 decayed `value` as a SpiritNeed: `factor = value`, `tier` re-derived from the
    factor via the existing NEED_TIERS factor→tier mapping (so a value below the unwell threshold
    reads `unwell`, the natural floor for a depleted-but-not-yet-dead need)."""
    return SpiritNeed(tier=_tier_for_factor(value), factor=value)


def needs(
    db: DBSession,
    path: str | None,
    user_id: uuid.UUID,
    *,
    now: datetime,
    needs_baseline_at: datetime,
    nourished_tended_at: datetime | None = None,
    rested_tended_at: datetime | None = None,
    joyful_tended_at: datetime | None = None,
) -> SpiritNeeds:
    """The active creature's three SURVIVAL needs, decayed in real time (ADR-0029 — supersedes
    ADR-0023's rolling-window advisory needs and the cosmetic modifiers of ADR-0025/0026/0028).

    A pathless spark (path is None) has no chosen creature, so every need returns a neutral,
    content-ish default rather than decaying.

    Otherwise each need's 0..1 value = `max(practice_value, tend_value)` (see
    `_need_value_and_zero_time`), where the practice "last fed" time is
    `max(needs_baseline_at, last_relevant_activity)`:
    - nourished ← the dosha's SIGNATURE practice (the balancing one);
    - rested    ← ANY practice session (a sit of any kind);
    - joyful    ← a gratitude or journal entry.
    Practice fills to 1.0; a tend (`*_tended_at`) tops up to TEND_CAP. There is NO floor — a need
    can decay to 0 (the non-punishing floor of ADR-0023 is intentionally removed).
    """
    if path is None or path not in _CHOOSABLE_PATHS:
        neutral = _neutral_need()
        return SpiritNeeds(nourished=neutral, rested=neutral, joyful=neutral)

    baseline = _as_aware(needs_baseline_at)
    now = _as_aware(now)

    # "Last fed by practice" per need = the later of the born-fed baseline and the most recent
    # relevant activity (None activity → just the baseline).
    nourished_fed = _latest(baseline, _last_signature_practice_at(db, path, user_id))
    rested_fed = _latest(baseline, _last_any_session_at(db, user_id))
    joyful_fed = _latest(baseline, _last_reflection_at(db, user_id))

    nourished_value, _ = _need_value_and_zero_time(
        now, nourished_fed, _as_aware(nourished_tended_at)
    )
    rested_value, _ = _need_value_and_zero_time(
        now, rested_fed, _as_aware(rested_tended_at)
    )
    joyful_value, _ = _need_value_and_zero_time(
        now, joyful_fed, _as_aware(joyful_tended_at)
    )

    return SpiritNeeds(
        nourished=_need_from_value(nourished_value),
        rested=_need_from_value(rested_value),
        joyful=_need_from_value(joyful_value),
    )


def _health_state(
    db: DBSession,
    path: str | None,
    user_id: uuid.UUID,
    *,
    now: datetime,
    needs_baseline_at: datetime,
    nourished_tended_at: datetime | None,
    rested_tended_at: datetime | None,
    joyful_tended_at: datetime | None,
) -> tuple[bool, datetime | None]:
    """Compute the spirit's sickness/death state from the fed timestamps (ADR-0029), returning
    `(is_dead, death_time)`:

    - per need, `zero_time` is when its value hits 0;
    - `ailing_onset = min(zero_time over the 3 needs)` — when the WEAKEST need first empties, i.e.
      health (the weakest need) hits 0;
    - `death_time = ailing_onset + DEATH_DAYS`;
    - `is_dead = now >= death_time`.

    A pathless spark never sickens (no creature → no care requirement) → `(False, None)`. The
    caller persists `died_at = death_time` lazily and treats the spirit as ailing when health is 0
    but `now < death_time`."""
    if path is None or path not in _CHOOSABLE_PATHS:
        return False, None

    baseline = _as_aware(needs_baseline_at)
    now = _as_aware(now)

    nourished_fed = _latest(baseline, _last_signature_practice_at(db, path, user_id))
    rested_fed = _latest(baseline, _last_any_session_at(db, user_id))
    joyful_fed = _latest(baseline, _last_reflection_at(db, user_id))

    _, nourished_zero = _need_value_and_zero_time(
        now, nourished_fed, _as_aware(nourished_tended_at)
    )
    _, rested_zero = _need_value_and_zero_time(
        now, rested_fed, _as_aware(rested_tended_at)
    )
    _, joyful_zero = _need_value_and_zero_time(
        now, joyful_fed, _as_aware(joyful_tended_at)
    )

    ailing_onset = min(nourished_zero, rested_zero, joyful_zero)
    death_time = ailing_onset + timedelta(days=DEATH_DAYS)
    return now >= death_time, death_time


def overall_condition(spirit_needs: SpiritNeeds) -> SpiritCondition:
    """The overall care state = the WEAKEST of the three needs (ADR-0023), so the frontend can
    render one summary look. Ties on tier are broken by the lower factor. Visual-only."""
    weakest = min(
        (spirit_needs.nourished, spirit_needs.rested, spirit_needs.joyful),
        key=lambda n: (_TIER_RANK[n.tier], n.factor),
    )
    return SpiritCondition(tier=weakest.tier, factor=weakest.factor)


# --- Cosmetics economy (ADR-0027: a per-slot skill tree — unlock-to-own, free equip) -------
#
# Each slot is a small skill tree of options. ADR-0027: UNLOCKING an option (paying its cost,
# added to the monotonic `coins_spent` ledger, never refunded) adds it to the owned collection
# forever; equipping an owned option into its slot — or swapping/clearing what's shown — is FREE.
# An option's `tier` (1|2|3) gates the tree: tier 1 has no prereq; tier N>1 needs an owned option
# of tier N−1 in the same slot. The old slot-lock + paid upgrades-reset (ADR-0024) are gone. Costs
# spend from the derived coin balance, which comes from the STORED `coins_spent` ledger
# (`level × COINS_PER_LEVEL − coins_spent`), not the owned cosmetics, so nothing ever refunds.
#
# Kept calm and modest, on-theme (docs/design/spirit.md "Coins"): a soft aura, a small
# accessory, and a habitat/backdrop the spirit sits in. The old progressive
# anti-hoarding surcharge is intentionally dropped — there is one subject now, so the
# hoarding problem it solved no longer exists. All costs/unlock levels are tunable in-code
# constants — retuning needs no migration. An optional per-option `unlock_level` gates a
# couple of richer options behind a little growth (default 1 = always available).
#
# APPEND-ONLY / STABLE FOR OWNED KEYS. `_option_cost` prices an option from this catalog (0 for
# anything missing) for the affordability display and the `coins_spent` migration backfill. The
# stored spend ledger (ADR-0024) means a removed key no longer silently refunds, but a missing
# cost would still misprice the catalog — so never delete or rename an owned key; only add new
# slots/options, and only re-tune costs of options nobody owns. Test
# `test_owned_options_all_price_above_zero` guards against an owned key being dropped.
SPIRIT_COSMETICS_CATALOG: dict[str, dict[str, dict[str, int | str]]] = {
    # {slot: {option: {"cost", "unlock_level", "need", "tier" : ..., "per_path"?: str}}}
    # An OPTIONAL `per_path` restricts an option to a single chosen creature (dosha): the option
    # is then bought/seen only by that path (absent → universal, available to all). See the
    # path-exclusive capstones below for the only current use.
    # A REQUIRED `need` (ADR-0026) records the ONE need the item favours (nourished | rested |
    # joyful) — driving both the passive while-owned lift and the weighted fading buy-boost. Every
    # option has one (the catalog-coverage test guards this).
    # A REQUIRED `tier` (1|2|3, ADR-0027) places the option in its slot's skill tree: tier 1 has no
    # prerequisite (the starters); tier N>1 requires owning ≥1 option of tier N−1 IN THE SAME SLOT.
    # The path-exclusive capstones are tier 3. Drives the unlock prerequisite chain.
    # A soft surrounding glow — the gentlest touch, available from the start.
    "aura": {
        "soft": {"cost": 30, "unlock_level": 1, "need": RESTED, "tier": 1},
        "warm": {"cost": 45, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "starlit": {"cost": 70, "unlock_level": 5, "need": RESTED, "tier": 2},
        "ember": {"cost": 50, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "frost": {"cost": 55, "unlock_level": 2, "need": RESTED, "tier": 2},
        "rose": {"cost": 45, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        # Universal additions (no per_path) deepening the tree — one per tier with varied needs:
        # a soft green dew glow (tier 1), a deep-purple dusk glow (tier 2), and a shimmering
        # multi-hue aurora ribbon (the universal tier-3 crown of the slot, open to every path).
        "dewlight": {"cost": 40, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "twilight": {"cost": 90, "unlock_level": 4, "need": RESTED, "tier": 2},
        "aurora": {"cost": 180, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        # LEGENDARY (tier 4, ADR-0027) — the prestige endgame crown of the slot: a full
        # prismatic/rainbow radiant halo, joyful. Universal; highest level + cost, the richest art.
        # Gated behind owning any tier-3 aura (the generic tier prereq handles tier 4 too).
        "prismatic": {"cost": 380, "unlock_level": 10, "need": JOYFUL, "tier": 4},
        # PATH-EXCLUSIVE auras (like the companions above): the ember flames for fiery Pitta
        # (breath), the verdant grove for grounded Kapha (stillness), the airy zephyr for Vata
        # (heart). Only the matching creature can buy/see each. The tier-3 capstones.
        "emberflame": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": NOURISHED, "tier": 3,
        },
        "grove": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": NOURISHED, "tier": 3,
        },
        "zephyr": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
    # A small worn accessory. halo/leaf_crown/ribbon/flower/scarf/star/berry_sprig/tiny_bell/
    # antlers are universal; the three PATH-EXCLUSIVE accessories carry a `per_path` key so only
    # the matching creature can buy (and see) them — the ember crown for the fiery Pitta (breath),
    # the mossy stone circlet for the grounded Kapha (stillness), the feather plume for the airy
    # Vata (heart).
    "accessory": {
        "halo": {"cost": 40, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        "leaf_crown": {"cost": 55, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "ribbon": {"cost": 35, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        "flower": {"cost": 40, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        # A little berry-and-leaf sprig tucked at the brow — nourishing greenery (tier 1).
        "berry_sprig": {"cost": 45, "unlock_level": 2, "need": NOURISHED, "tier": 1},
        "scarf": {"cost": 45, "unlock_level": 2, "need": RESTED, "tier": 2},
        "star": {"cost": 60, "unlock_level": 5, "need": JOYFUL, "tier": 2},
        # A small jingle bell on a cord — a cheerful little chime (tier 2).
        "tiny_bell": {"cost": 85, "unlock_level": 4, "need": JOYFUL, "tier": 2},
        # Small branching antlers — a calm, woodland crown of rest (tier 3).
        "antlers": {"cost": 170, "unlock_level": 7, "need": RESTED, "tier": 3},
        # QUIRKY personality/hobby accessories (universal) — playful worn items that express the
        # practitioner's vibe rather than a nature/dosha theme. Spread across tiers and needs.
        # Sleek over-ear headphones resting on the head — a calm music vibe (tier 1).
        "headphones": {"cost": 45, "unlock_level": 1, "need": RESTED, "tier": 1},
        # Round studious spectacles perched on the brow — the book-loving look (tier 1).
        "nerd_glasses": {"cost": 50, "unlock_level": 2, "need": RESTED, "tier": 1},
        # An over-ear gaming headset with a boom mic — ready to play (tier 2).
        "gaming_headset": {"cost": 95, "unlock_level": 3, "need": JOYFUL, "tier": 2},
        # A cosy knit beanie with a little pom on top — comfy and warm (tier 2).
        "beanie": {"cost": 80, "unlock_level": 4, "need": RESTED, "tier": 2},
        # A striped cone party hat topped with a pompom — pure celebration (tier 3).
        "party_hat": {"cost": 175, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        # LEGENDARY (tier 4) — a crown of stars circling the brow, joyful. Universal; the
        # prestige endgame accessory, gated behind any tier-3 accessory.
        "star_crown": {"cost": 400, "unlock_level": 10, "need": JOYFUL, "tier": 4},
        "ember_crown": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": NOURISHED, "tier": 3,
        },
        "mossy_circlet": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": RESTED, "tier": 3,
        },
        "feather_plume": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
    # A small backdrop the spirit sits in (the "habitat"). meadow/dusk/night/garden/seaside/
    # cottage/lily_pond/autumn_grove/starfall are universal; the three PATH-EXCLUSIVE backdrops
    # carry a `per_path` key so only
    # the matching creature can buy (and see) them — the ember canyon for the fiery Pitta
    # (breath), the misty grove for the grounded Kapha (stillness), the open sky for the airy
    # Vata (heart).
    "habitat": {
        "meadow": {"cost": 50, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        "dusk": {"cost": 65, "unlock_level": 3, "need": RESTED, "tier": 2},
        "night": {"cost": 80, "unlock_level": 7, "need": RESTED, "tier": 3},
        "garden": {"cost": 60, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "seaside": {"cost": 70, "unlock_level": 3, "need": RESTED, "tier": 2},
        "cottage": {"cost": 90, "unlock_level": 7, "need": RESTED, "tier": 3},
        "lily_pond": {"cost": 55, "unlock_level": 2, "need": RESTED, "tier": 1},
        "autumn_grove": {"cost": 100, "unlock_level": 4, "need": NOURISHED, "tier": 2},
        "starfall": {"cost": 180, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        # LEGENDARY (tier 4) — a cosmic nebula backdrop strewn with stars, rested. Universal; the
        # prestige endgame habitat, gated behind any tier-3 habitat.
        "nebula": {"cost": 420, "unlock_level": 10, "need": RESTED, "tier": 4},
        "ember_canyon": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": NOURISHED, "tier": 3,
        },
        "misty_grove": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": RESTED, "tier": 3,
        },
        "open_sky": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
    # A small friend that keeps the spirit company (the "companion"). firefly/bird/cat are
    # universal; the three PATH-EXCLUSIVE companions carry a `per_path` key so only the matching
    # creature can buy (and see) them — the nine-tail kitsune for the fiery Pitta (breath), the
    # jade tortoise for the grounded Kapha (stillness), the paper crane for the airy Vata (heart).
    "companion": {
        "firefly": {"cost": 100, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        "snail": {"cost": 110, "unlock_level": 2, "need": RESTED, "tier": 1},
        "bird": {"cost": 160, "unlock_level": 3, "need": JOYFUL, "tier": 2},
        "frog": {"cost": 175, "unlock_level": 4, "need": JOYFUL, "tier": 2},
        "cat": {"cost": 240, "unlock_level": 7, "need": RESTED, "tier": 3},
        "owl": {"cost": 250, "unlock_level": 7, "need": NOURISHED, "tier": 3},
        # QUIRKY HOBBY companions (universal, no per_path) — little personality props that float
        # beside the spirit rather than animals/nature: gym, gaming, reading, coffee, music. Priced
        # a touch higher than the creatures and spread across tiers 1–3 with varied need affinities.
        "dumbbell": {"cost": 95, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "coffee_mug": {"cost": 120, "unlock_level": 2, "need": NOURISHED, "tier": 1},
        "open_book": {"cost": 165, "unlock_level": 3, "need": RESTED, "tier": 2},
        "game_controller": {"cost": 185, "unlock_level": 5, "need": JOYFUL, "tier": 2},
        "boombox": {"cost": 250, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        # LEGENDARY (tier 4) — a small mythical curled dragon, nourished. Universal; the prestige
        # endgame companion, gated behind any tier-3 companion.
        "dragon": {"cost": 450, "unlock_level": 10, "need": NOURISHED, "tier": 4},
        "kitsune": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": JOYFUL, "tier": 3,
        },
        "tortoise": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": RESTED, "tier": 3,
        },
        "crane": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
    # A serene thing the spirit floats on / rides — the calm take on a "mount". cloud/lotus/leaf
    # are universal; the three PATH-EXCLUSIVE mounts carry a `per_path` key so only the matching
    # creature can buy (and see) them — the ember sun-stone for the fiery Pitta (breath), the
    # mossy boulder for the grounded Kapha (stillness), the breeze-borne feather for the airy
    # Vata (heart).
    "mount": {
        "cloud": {"cost": 70, "unlock_level": 1, "need": RESTED, "tier": 1},
        "mossy_stump": {"cost": 75, "unlock_level": 2, "need": NOURISHED, "tier": 1},
        "lotus": {"cost": 90, "unlock_level": 3, "need": RESTED, "tier": 2},
        "reed_raft": {"cost": 130, "unlock_level": 4, "need": RESTED, "tier": 2},
        "leaf": {"cost": 120, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        "crystal": {"cost": 190, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        # LEGENDARY (tier 4) — a radiant comet/star the spirit rides, joyful. Universal; the
        # prestige endgame mount, gated behind any tier-3 mount.
        "comet": {"cost": 410, "unlock_level": 10, "need": JOYFUL, "tier": 4},
        "emberstone": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": NOURISHED, "tier": 3,
        },
        "boulder": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": RESTED, "tier": 3,
        },
        "feather": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
    # An ambient drifting overlay across the whole scene (the "weather") — light particles that
    # drift over everything, kept subtle so they never obscure the figure. The universal options
    # (petals/mist/rain/leaffall/snow/fireflies) are tiered like the rest of the tree (tier 1
    # starters → tier 3 capstone) with varied need affinities; the three PATH-EXCLUSIVE weathers
    # carry a `per_path` key so only the matching creature can buy (and see) them — drifting embers
    # for the fiery Pitta (breath), a golden pollen fall for the grounded Kapha (stillness), and
    # swirling wind gusts for the airy Vata (heart). The path-exclusive ones are tier-3 capstones.
    "weather": {
        "petals": {"cost": 50, "unlock_level": 1, "need": JOYFUL, "tier": 1},
        "mist": {"cost": 45, "unlock_level": 1, "need": RESTED, "tier": 1},
        "rain": {"cost": 90, "unlock_level": 3, "need": RESTED, "tier": 2},
        "leaffall": {"cost": 110, "unlock_level": 4, "need": NOURISHED, "tier": 2},
        "snow": {"cost": 180, "unlock_level": 7, "need": RESTED, "tier": 3},
        "fireflies": {"cost": 200, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        # LEGENDARY (tier 4) — an auroral storm overlay rippling across the scene, joyful.
        # Universal; the prestige endgame weather, gated behind any tier-3 weather.
        "aurora_storm": {"cost": 390, "unlock_level": 10, "need": JOYFUL, "tier": 4},
        "ember_drift": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": NOURISHED, "tier": 3,
        },
        "pollenfall": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": RESTED, "tier": 3,
        },
        "galeswirl": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
    # A low foreground base decoration along the very bottom edge (the "ground") — a strip that
    # reads as the floor the figure rests on. The universal options (grass/pebbles/clover/
    # mushrooms/wildflowers/crystals) are tiered with varied need affinities; the three
    # PATH-EXCLUSIVE grounds carry a `per_path` key so only the matching creature can buy (and see)
    # them — a bed of glowing coals for the fiery Pitta (breath), a raked zen stone garden for the
    # grounded Kapha (stillness), and a soft cloud floor for the airy Vata (heart). The
    # path-exclusive ones are tier-3 capstones.
    "ground": {
        "grass": {"cost": 50, "unlock_level": 1, "need": NOURISHED, "tier": 1},
        "pebbles": {"cost": 45, "unlock_level": 2, "need": RESTED, "tier": 1},
        "clover": {"cost": 90, "unlock_level": 3, "need": JOYFUL, "tier": 2},
        "mushrooms": {"cost": 120, "unlock_level": 4, "need": NOURISHED, "tier": 2},
        "wildflowers": {"cost": 190, "unlock_level": 7, "need": JOYFUL, "tier": 3},
        "crystals": {"cost": 210, "unlock_level": 7, "need": RESTED, "tier": 3},
        # LEGENDARY (tier 4) — a glowing sacred mandala floor, rested. Universal; the prestige
        # endgame ground, gated behind any tier-3 ground.
        "mandala": {"cost": 400, "unlock_level": 10, "need": RESTED, "tier": 4},
        "emberbed": {
            "cost": 220, "unlock_level": 6, "per_path": BREATH, "need": NOURISHED, "tier": 3,
        },
        "stonegarden": {
            "cost": 220, "unlock_level": 6, "per_path": STILLNESS, "need": RESTED, "tier": 3,
        },
        "cloudfloor": {
            "cost": 220, "unlock_level": 6, "per_path": HEART, "need": JOYFUL, "tier": 3,
        },
    },
}


def _option_cost(slot: str, option: str) -> int:
    """The coin cost of a catalog option (0 for unknown slot/option — never a phantom charge)."""
    return SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("cost", 0)


def _option_unlock_level(slot: str, option: str) -> int:
    """The level an option unlocks at (1 = always available; unknown → 1)."""
    return int(SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("unlock_level", 1))


def _option_per_path(slot: str, option: str) -> str | None:
    """The path an option is EXCLUSIVE to, or None when it's universal (the common case). A
    `per_path` option (e.g. a path-exclusive companion) can only be seen/bought by the matching
    chosen creature; an absent key means every path may use it. Unknown slot/option → None."""
    per_path = SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("per_path")
    return str(per_path) if per_path is not None else None


def _signature_option(slot: str, path: str | None) -> str | None:
    """The SIGNATURE option for `slot` and chosen `path` (ADR-0028) = the slot's option whose
    `per_path == path` — its path-exclusive tier-3 capstone. There is exactly one per slot for a
    chosen path (a catalog invariant; the set-coverage test guards it), so the first match is the
    signature. None for a pathless spark (no creature → no signature) or an unknown slot."""
    if path is None or path not in _CHOOSABLE_PATHS:
        return None
    for option in SPIRIT_COSMETICS_CATALOG.get(slot, {}):
        if _option_per_path(slot, option) == path:
            return option
    return None


def _signature_set_status(cosmetics: dict[str, str], path: str | None) -> tuple[int, int]:
    """Progress toward the SIGNATURE SET (ADR-0028) as `(owned, total)`:

    - `total` = the number of slots that have a signature option for the chosen `path` (7 for a
      chosen creature, given the per-slot-per-path catalog invariant);
    - `owned` = how many of those slots are currently EQUIPPED with their signature option
      (`cosmetics[slot] == signature(slot)`).

    A pathless spark has no signatures → `(0, 0)`. Pure function of the equipped loadout + path;
    no DB, no stored flag — fully derivable (no migration)."""
    total = 0
    owned = 0
    for slot in SPIRIT_COSMETICS_CATALOG:
        signature = _signature_option(slot, path)
        if signature is None:
            continue
        total += 1
        if cosmetics.get(slot) == signature:
            owned += 1
    return owned, total


def _signature_set_bonus(cosmetics: dict[str, str], path: str | None) -> SpiritSetBonus:
    """The SIGNATURE SET BONUS read-out (ADR-0028; needs-effect removed by ADR-0029). The set is
    COMPLETE — and the status ACTIVE — when every slot that has a signature option for the chosen
    `path` is equipped with it (owned == total, and total > 0). It is now a purely visual flourish
    (no needs lift). Derivable from the equipped cosmetics + path; never stored."""
    owned, total = _signature_set_status(cosmetics, path)
    active = total > 0 and owned == total
    return SpiritSetBonus(
        active=active,
        kind=SET_BONUS_KIND if active else None,
        count=owned,
        total=total,
        label=SET_BONUS_LABEL,
    )


def _option_need(slot: str, option: str) -> str:
    """The need a catalog option FAVOURS (ADR-0026) — one of `nourished` / `rested` / `joyful`.
    A display tag only now (ADR-0029 removed its needs effect): the shop and choose-page preview
    surface it. Every real option has an explicit `need`; an unknown slot/option (or a missing key)
    falls back to DEFAULT_ITEM_NEED so the tag is never need-less."""
    need = SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("need")
    return str(need) if need is not None else DEFAULT_ITEM_NEED


def _option_tier(slot: str, option: str) -> int:
    """The skill-tree tier (1 | 2 | 3) of a catalog option within its slot (ADR-0027). Tier 1
    has no prerequisite; tier N>1 requires owning ≥1 option of tier N−1 in the SAME slot. Unknown
    slot/option (or a missing key) falls back to tier 1 (no prereq) so the gate never blocks a
    phantom option."""
    return int(SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("tier", 1))


def _cosmetics(spirit: Spirit) -> dict[str, str]:
    """The spirit's EQUIPPED loadout (ADR-0027), defensively normalized to {str: str}. A
    fresh/legacy spark has {} → nothing equipped, exactly the base form."""
    raw = spirit.cosmetics or {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if isinstance(v, (str, int))}


def _unlocked_list(spirit: Spirit) -> list[str]:
    """The spirit's unlocked-collection list (ADR-0027), defensively normalized to [str]. A
    fresh/legacy spark has [] (the column defaults to an empty list)."""
    raw = spirit.unlocked or []
    if not isinstance(raw, list):
        return []
    return [str(v) for v in raw if isinstance(v, (str, int))]


def _owned(spirit: Spirit) -> set[str]:
    """The EFFECTIVE owned set (ADR-0027) = the unlocked collection UNION the equipped loadout's
    values. The union is the legacy bridge: a spirit that equipped/paid for items before this
    feature has them only in `cosmetics`, so counting equipped items as owned means no data
    backfill — those items stay owned (and re-equippable) forever."""
    return set(_unlocked_list(spirit)) | set(_cosmetics(spirit).values())


def _reconciled_unlocked(spirit: Spirit) -> list[str]:
    """The `unlocked` list folded together with any currently-equipped (legacy) items, preserving
    order and de-duplicating (ADR-0027). Persisting this on every write makes ownership MONOTONIC:
    a legacy item that lived only in the equipped `cosmetics` map is captured into `unlocked`, so
    clearing/swapping its slot can never drop it from the owned set."""
    out = list(_unlocked_list(spirit))
    seen = set(out)
    for option in _cosmetics(spirit).values():
        if option not in seen:
            out.append(option)
            seen.add(option)
    return out


def _tier_prereq_met(slot: str, option: str, owned: set[str]) -> bool:
    """Whether `option`'s skill-tree prerequisite is satisfied (ADR-0027): tier 1 always is;
    tier N>1 requires owning AT LEAST ONE option of tier N−1 in the SAME slot. Reads the owned
    set against the catalog tiers."""
    tier = _option_tier(slot, option)
    if tier <= 1:
        return True
    prev = tier - 1
    return any(
        opt in owned and _option_tier(slot, opt) == prev
        for opt in SPIRIT_COSMETICS_CATALOG.get(slot, {})
    )


def _is_unlockable(slot: str, option: str, owned: set[str], level: int, path: str | None) -> bool:
    """Whether `option` is currently UNLOCKABLE (ADR-0027) — every gate EXCEPT affordability:
    not already owned; per-path available to this creature; level ≥ unlock_level; and the
    tier prerequisite met. Affordability is reported separately (`affordable`) so the UI can
    distinguish "can't yet" from "can't afford"."""
    if option in owned:
        return False
    per_path = _option_per_path(slot, option)
    if per_path is not None and per_path != path:
        return False
    if level < _option_unlock_level(slot, option):
        return False
    return _tier_prereq_met(slot, option, owned)


def _available_slots(
    cosmetics: dict[str, str],
    owned: set[str],
    balance: int,
    level: int,
    path: str | None,
) -> list[SpiritAvailableSlot]:
    """The cosmetics catalog as a per-slot skill tree with per-option state (ADR-0027) — the
    "personalize" shape the Spirit panel uses. A slot now reports its EQUIPPED option (or null)
    and is never "locked"; each option reports cost / unlock_level / tier / need plus the state
    flags `owned`, `equipped`, `unlockable`, `affordable`, and `available` (per-path).

    `unlockable` is true only when the option isn't owned and its path, level, and tier-prereq
    are all met (affordability is the separate `affordable` flag, so the UI can tell "locked" from
    "too pricey"). `available` reflects per-path exclusivity: a universal option (no `per_path`)
    is offered to every creature; a path-exclusive one only to the matching chosen `path` (and to
    nobody while pathless). The frontend filters out the unavailable ones.
    """
    out: list[SpiritAvailableSlot] = []
    for slot, options in SPIRIT_COSMETICS_CATALOG.items():
        equipped = cosmetics.get(slot)
        opts: list[SpiritSlotOption] = []
        for option, spec in options.items():
            unlock_level = int(spec["unlock_level"])
            cost = int(spec["cost"])
            tier = _option_tier(slot, option)
            per_path = _option_per_path(slot, option)
            available = per_path is None or per_path == path
            is_owned = option in owned
            opts.append(
                SpiritSlotOption(
                    option=option,
                    cost=cost,
                    unlock_level=unlock_level,
                    unlock_hint=(
                        None if level >= unlock_level else f"Reach level {unlock_level}"
                    ),
                    tier=tier,
                    affordable=balance >= cost,
                    owned=is_owned,
                    equipped=equipped == option,
                    unlockable=_is_unlockable(slot, option, owned, level, path),
                    available=available,
                    # This is the chosen creature's OWN per-path signature capstone (vs a universal
                    # option) — surfaced so the tree can give the prize pieces a flashier treatment.
                    exclusive=per_path is not None and per_path == path,
                    # The need this option favours (ADR-0026), so the shop can tag it.
                    need=_option_need(slot, option),
                )
            )
        # Order so the equipped option leads, then owned, then unlockable, then the rest — ties
        # broken by tier then cost ascending so a slot's tree reads low → high.
        opts.sort(
            key=lambda o: (not o.equipped, not o.owned, not o.unlockable, o.tier, o.cost)
        )
        out.append(SpiritAvailableSlot(slot=slot, equipped=equipped, options=opts))
    return out


# --- Read-only per-path tree PREVIEW (the choose page; no spirit state needed) ------------
#
# What each creature GROWS INTO, computed straight from the static catalog — no DB, no spirit
# row. For a given path we list each slot's options it could ever own (universal options + that
# path's OWN per-path capstones), ordered by tier so the tree reads low → high. Other paths'
# exclusives are excluded — the choose page only previews what THIS creature can grow into.


def path_tree_preview(path: str) -> list[SlotPreview]:
    """The read-only skill-tree preview for one path (ADR-0027) — every slot with the options
    that path can own, ordered by tier. An option is included when it's universal (no `per_path`)
    or path-EXCLUSIVE to this path; other paths' exclusives are dropped. Each option reports its
    static catalog facts (tier / cost / unlock_level / need) plus `exclusive` = whether it's this
    path's own per-path capstone. Pure function of the catalog — no spirit needed."""
    slots: list[SlotPreview] = []
    for slot, options in SPIRIT_COSMETICS_CATALOG.items():
        opts: list[OptionPreview] = []
        for option in options:
            per_path = _option_per_path(slot, option)
            # Universal (no per_path) or this path's own exclusive; skip other paths' exclusives.
            if per_path is not None and per_path != path:
                continue
            opts.append(
                OptionPreview(
                    option=option,
                    tier=_option_tier(slot, option),
                    cost=_option_cost(slot, option),
                    unlock_level=_option_unlock_level(slot, option),
                    need=_option_need(slot, option),
                    exclusive=per_path == path,
                )
            )
        # Tier-ascending so the tree reads low → high; ties broken by cost then option key for a
        # stable, deterministic order.
        opts.sort(key=lambda o: (o.tier, o.cost, o.option))
        slots.append(SlotPreview(slot=slot, options=opts))
    return slots


def all_paths_preview() -> dict[str, list[SlotPreview]]:
    """Every choosable creature's tree preview at once, keyed by path (the choose page fetches
    this once to surface what each creature grows into). Static catalog data — no DB query."""
    return {path: path_tree_preview(path) for path in (STILLNESS, BREATH, HEART)}


def get_or_create_active_spirit(db: DBSession, user_id: uuid.UUID) -> Spirit:
    """The user's active spirit (the row with `retired_at IS NULL`), creating a pathless
    spark on first read. Lazy creation handles both new users and migrated users without a
    heavy backfill. A concurrent first-read race is resolved by the partial unique index:
    on collision we roll back and re-read the row the other request just committed.
    """
    spirit = db.execute(
        select(Spirit).where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
    ).scalar_one_or_none()
    if spirit is not None:
        return spirit

    # ADR-0029: a fresh spark is BORN FED — `needs_baseline_at = now()` anchors the decay so every
    # need starts full (the server_default also covers this; set explicitly for clarity).
    spirit = Spirit(
        user_id=user_id, path=None, cosmetics={}, unlocked=[], needs_baseline_at=func.now()
    )
    db.add(spirit)
    try:
        db.commit()
    except IntegrityError:
        # Another request created the active spirit first — the partial unique index caught
        # the duplicate. Roll back and read the winner's row.
        db.rollback()
        spirit = db.execute(
            select(Spirit).where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
        ).scalar_one()
        return spirit
    db.refresh(spirit)
    return spirit


def _collection(db: DBSession, user_id: uuid.UUID) -> list[RetiredSpirit]:
    """The user's retired spirits — past companions kept forever (the replay loop): graduates that
    reached radiant AND, since ADR-0029, ones that DIED of neglect (carrying `died_at` so the
    gallery can memorialize them with their lifespan). Ordered most recently retired first. Empty
    for a user who has never awakened a new spark."""
    rows = db.execute(
        select(Spirit)
        .where(Spirit.user_id == user_id, Spirit.retired_at.is_not(None))
        # Most recently retired first; stable tiebreaks (created_at, then id) so spirits that
        # share a retired_at can't tie into a nondeterministic order.
        .order_by(Spirit.retired_at.desc(), Spirit.created_at.desc(), Spirit.id)
    ).scalars().all()
    return [
        RetiredSpirit(
            id=str(row.id),
            # A graduate retired at radiant (the final stage); a DIED spirit (ADR-0029) didn't
            # necessarily — its exact death stage isn't stored, so the gallery keys off `died_at`
            # (memorial + lifespan) rather than the stage for those.
            stage=STAGE_BANDS[-1][0],
            path=row.path,
            name=row.name,
            died_at=_as_aware(row.died_at) if row.died_at is not None else None,
            awakened_at=_as_aware(row.awakened_at),
        )
        for row in rows
    ]


def _build_state(
    db: DBSession,
    user_id: uuid.UUID,
    spirit: Spirit,
    *,
    today: date,
    tz: str,
    basis: dashboard_service.WalletBasis | None = None,
) -> SpiritState:
    """Assemble the active spirit's computed read state from the (chosen-or-pathless) spirit
    row plus the user's wallet basis. Shared by the read endpoint and every write so the
    response shape is built once.

    `basis` is computed here only if not supplied — callers that already have it (the read
    endpoint, the writes) pass it through so the request does exactly one `get_wallet_basis`.
    """
    if basis is None:
        basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    # ADR-0030 ("rebirth from a spark"): the spirit GROWS on its OWN life — the XP earned SINCE
    # `awakened_at` (this spirit's birth), not the user's lifetime XP. We compute a SECOND wallet
    # basis scoped to that window (`since=awakened_at`): its level is the SPIRIT-LEVEL, which drives
    # the stage, the bond, and the cosmetic unlock-level gates, so a freshly awakened spark starts
    # at level 1 (→ `spark`) even on a seasoned account and must be re-grown. The LIFETIME basis
    # still funds COINS (the owner's "keep your coin budget" choice — a young spark keeps the full
    # account budget). For a first/never-died spirit (awakened ≈ account start) the two bases match,
    # so its stage/level are unchanged (backward-compatible — no migration).
    lifetime_level = basis.level
    spirit_basis = dashboard_service.get_wallet_basis(
        db, user_id, today=today, tz=tz, since=_as_aware(spirit.awakened_at)
    )
    level = spirit_basis.level
    now = datetime.now(UTC)

    cosmetics = _cosmetics(spirit)
    # ADR-0027: the effective owned set = the unlocked collection ∪ the equipped loadout values,
    # so legacy already-equipped items count as owned with no backfill.
    owned = _owned(spirit)
    # ADR-0024 + ADR-0030: the balance comes from the STORED spend ledger and the LIFETIME level —
    # coins are an account budget, NOT scoped to the spirit's own life.
    coins = _coin_balance(lifetime_level, spirit.coins_spent)

    # ADR-0028 (status only, ADR-0029): the signature-set bonus is DERIVED from the equipped
    # cosmetics + path; it's a visual flourish now (no needs lift).
    set_bonus = _signature_set_bonus(cosmetics, spirit.path)

    # ADR-0029: the three needs are SURVIVAL meters decayed in real time off the born-fed baseline,
    # the most-recent relevant practice, and the per-need tend stamps. A pathless spark gets neutral
    # defaults.
    baseline = spirit.needs_baseline_at
    spirit_needs = needs(
        db,
        spirit.path,
        user_id,
        now=now,
        needs_baseline_at=baseline,
        nourished_tended_at=spirit.nourished_tended_at,
        rested_tended_at=spirit.rested_tended_at,
        joyful_tended_at=spirit.joyful_tended_at,
    )

    # ADR-0029 sickness/death: health = the weakest need. When it has been empty for DEATH_DAYS the
    # spirit dies; `died_at` is the frozen real moment (may be in the past), persisted LAZILY here
    # the first time death is detected (the established write-on-read pattern). Death is TERMINAL —
    # once `died_at` is set we never recompute or clear it.
    dead, ailing, died_at = _resolve_health(db, user_id, spirit, now=now)

    return SpiritState(
        # ADR-0030: `stage` and `bond` key off the SPIRIT-LEVEL (XP earned since `awakened_at`),
        # so a just-awakened spark reads as `spark`/level 1 even at high lifetime XP.
        stage=stage_for_level(level),
        path=spirit.path,
        name=spirit.name,
        # `bond.level` is the SPIRIT-LEVEL — this pet's OWN growth (earned XP since `awakened_at`,
        # ADR-0030), NOT the dashboard's lifetime level. Like the lifetime basis it is the
        # *earned-XP* level (streak-bonus XP excluded), so the spirit's progress is un-loseable; it
        # just measures only the spirit's own life. For a first/never-died spirit it equals the
        # lifetime level (backward-compatible).
        bond=SpiritBond(
            level=level,
            xp_into_level=spirit_basis.xp_into_level,
            xp_for_next=spirit_basis.xp_for_next,
        ),
        needs=spirit_needs,
        # The overall condition is the weakest of the three needs (ADR-0029: = health).
        condition=overall_condition(spirit_needs),
        coins=coins,
        cosmetics=cosmetics,
        available=_available_slots(cosmetics, owned, coins, level, spirit.path),
        collection=_collection(db, user_id),
        set_bonus=set_bonus,
        dead=dead,
        died_at=died_at,
        ailing=ailing,
        awakened_at=spirit.awakened_at,
    )


def _resolve_health(
    db: DBSession, user_id: uuid.UUID, spirit: Spirit, *, now: datetime
) -> tuple[bool, bool, datetime | None]:
    """Resolve `(dead, ailing, died_at)` for the active spirit (ADR-0029), persisting death lazily.

    - If `died_at` is already set, the spirit stays dead (terminal) — return it as-is.
    - Otherwise compute death from the fed timestamps. If `now` has reached the death time, PERSIST
      `died_at = death_time` (the real moment, possibly in the past) and commit, then report dead.
    - `ailing` = health (the weakest need) is at 0 but the spirit is not yet dead. Derived from the
      same needs read; no stored column.
    A pathless spark never sickens."""
    if spirit.died_at is not None:
        return True, False, _as_aware(spirit.died_at)

    is_dead, death_time = _health_state(
        db,
        spirit.path,
        user_id,
        now=now,
        needs_baseline_at=spirit.needs_baseline_at,
        nourished_tended_at=spirit.nourished_tended_at,
        rested_tended_at=spirit.rested_tended_at,
        joyful_tended_at=spirit.joyful_tended_at,
    )
    if is_dead and death_time is not None:
        # First detection — freeze the real death moment and commit (write-on-read).
        spirit.died_at = death_time
        db.commit()
        db.refresh(spirit)
        return True, False, _as_aware(spirit.died_at)

    # Not dead. Ailing = health (the weakest need) has hit 0 but the death window hasn't elapsed.
    spirit_needs = needs(
        db,
        spirit.path,
        user_id,
        now=now,
        needs_baseline_at=spirit.needs_baseline_at,
        nourished_tended_at=spirit.nourished_tended_at,
        rested_tended_at=spirit.rested_tended_at,
        joyful_tended_at=spirit.joyful_tended_at,
    )
    health = overall_condition(spirit_needs).factor
    ailing = health <= 0.0
    return False, ailing, None


def get_spirit(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> SpiritState:
    """The active spirit's computed state: stage, the chosen path (or NULL while pathless),
    bond, the per-creature condition, coins, owned cosmetics + the catalog with per-option
    state, and the retired collection. Get-or-creates the spark on first read. The path is
    no longer auto-committed (ADR-0023) — it is set explicitly via `choose_path`, so this is
    a get-or-create read only."""
    spirit = get_or_create_active_spirit(db, user_id)
    return _build_state(db, user_id, spirit, today=today, tz=tz)


def choose_path(
    db: DBSession,
    user_id: uuid.UUID,
    data: ChoosePathRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SpiritState:
    """Choose the active creature + name it ONCE (ADR-0023 / ADR-0024). Sets `path` AND `name`
    atomically only while `path` is currently NULL; a re-choose raises PathAlreadyChosen (409).
    The schema already constrains `path` to a valid enum value (bad value → 422) and requires a
    non-empty, length-capped `name` (empty/whitespace → 422) before we get here.

    Race-safe and idempotent like the rest of the spirit writes: a conditional UPDATE
    (`WHERE id = :id AND path IS NULL`) under the per-user advisory lock, so two concurrent
    choices can't both win — the loser matches 0 rows and is reported as already-chosen.
    """
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)
    if spirit.path is not None:
        raise PathAlreadyChosen(str(spirit.id))

    result = db.execute(
        Spirit.__table__.update()
        .where(Spirit.id == spirit.id, Spirit.path.is_(None))
        .values(path=data.path, name=data.name)
    )
    db.commit()
    if not result.rowcount:
        # A concurrent choose set it first — the choice is once-only, so this loses.
        db.refresh(spirit)
        raise PathAlreadyChosen(str(spirit.id))
    spirit.path = data.path
    spirit.name = data.name
    return _build_state(db, user_id, spirit, today=today, tz=tz)


def unlock_cosmetic(
    db: DBSession,
    user_id: uuid.UUID,
    data: CosmeticsRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SpiritState:
    """Unlock a cosmetic option into the active spirit's owned collection AND auto-equip it
    (ADR-0027). Unlocking is the new "buying": it charges the option's full cost (added to the
    monotonic `coins_spent` ledger, never refunded), adds the option to `unlocked`, and equips it
    in its slot. It still STAMPS `last_pampered_at` + the bought item's need for forward-compat,
    but ADR-0029 removed the pamper needs effect (cosmetics are purely cosmetic now).

    Validates: unknown slot/option, or a path-exclusive option this creature can't use →
    UnknownCosmetic (404, exactly as the GET `available` shape hides it); already owned →
    AlreadyOwned (409); level below unlock_level → CosmeticLocked (409); tier prerequisite not met
    → PrerequisiteNotMet (409); can't afford the cost → InsufficientCoins (409).

    The whole read-compute-write runs under the per-user advisory lock, so a concurrent unlock
    can't double-spend or clobber the JSON columns / ledger (last-writer-wins).
    """
    # Validate the catalog request before taking the lock (pure, no DB).
    if data.slot not in SPIRIT_COSMETICS_CATALOG:
        raise UnknownCosmetic(data.slot)
    if data.option not in SPIRIT_COSMETICS_CATALOG[data.slot]:
        raise UnknownCosmetic(data.option)

    # Lock FIRST — so the affordability math AND the owned set / ledger we read are taken under
    # the per-user lock; a concurrent unlock otherwise reads a stale snapshot and could
    # double-spend or clobber the JSON columns / ledger (last-writer-wins).
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)

    # A path-EXCLUSIVE option can only be unlocked by the matching chosen creature; for any other
    # path (or a pathless spark) it isn't in this spirit's catalog at all, so we reject it as an
    # unknown cosmetic (→ 404), exactly as the GET `available` shape hides it.
    per_path = _option_per_path(data.slot, data.option)
    if per_path is not None and per_path != spirit.path:
        raise UnknownCosmetic(data.option)

    owned = _owned(spirit)
    # Owned is forever — re-unlocking would double-charge. The free `equip` path is how you
    # re-show an already-owned option.
    if data.option in owned:
        raise AlreadyOwned(data.option)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    # ADR-0030: the unlock-LEVEL gate keys off the SPIRIT-LEVEL (XP since `awakened_at`), so a young
    # spark can't unlock high-`unlock_level` cosmetics until it grows — matching the GET `available`
    # gating. COINS stay on the LIFETIME level (the account budget), so a seasoned account can still
    # afford an option once its spark has grown enough to unlock it.
    spirit_basis = dashboard_service.get_wallet_basis(
        db, user_id, today=today, tz=tz, since=_as_aware(spirit.awakened_at)
    )
    spirit_level = spirit_basis.level
    if spirit_level < _option_unlock_level(data.slot, data.option):
        raise CosmeticLocked(data.option)
    # Skill-tree gate (ADR-0027): tier N>1 needs an owned option of tier N−1 in the same slot.
    if not _tier_prereq_met(data.slot, data.option, owned):
        raise PrerequisiteNotMet(data.option)

    # Charge the full option cost and add it to the monotonic spend ledger, so the balance stays
    # consistent with `coins_spent`. The balance uses the LIFETIME level (coins are the account
    # budget, ADR-0030).
    cost = _option_cost(data.slot, data.option)
    balance = _coin_balance(basis.level, spirit.coins_spent)
    if balance < cost:
        raise InsufficientCoins(data.option)

    # Add to the owned collection AND auto-equip into the slot (ADR-0027). Reconcile first so any
    # legacy already-equipped item is captured into `unlocked` too (ownership stays monotonic).
    spirit.unlocked = [*_reconciled_unlocked(spirit), data.option]
    equipped = dict(_cosmetics(spirit))
    equipped[data.slot] = data.option
    spirit.cosmetics = equipped
    spirit.coins_spent = spirit.coins_spent + cost
    # ADR-0025/0026 stamped the unlock time + the bought item's need to drive a decaying needs
    # boost; ADR-0029 removed that effect, so these are now forward-compat-only stamps (read by
    # nothing). Kept so the columns/route behaviour stay stable. Same txn + lock as the
    # unlock/equip and the coins_spent bump.
    spirit.last_pampered_at = func.now()
    spirit.last_pampered_need = _option_need(data.slot, data.option)
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz, basis=basis)


def equip_cosmetic(
    db: DBSession,
    user_id: uuid.UUID,
    data: EquipRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SpiritState:
    """Equip an OWNED option into its slot, or clear the slot (ADR-0027) — FREE and instant. No
    coins, no pamper, no ledger change.

    `option is None` clears the slot. Otherwise validates the slot/option exist
    (UnknownCosmetic → 404), the option belongs to the named slot (UnknownCosmetic → 404, so a
    mismatched slot/option can't equip), and the spirit currently OWNS it (NotOwned → 409, since
    equip can only show what you've earned). Serialized under the per-user advisory lock so the
    read-compute-write is atomic against a concurrent unlock/equip.
    """
    # Validate the slot exists before the lock (pure, no DB).
    if data.slot not in SPIRIT_COSMETICS_CATALOG:
        raise UnknownCosmetic(data.slot)

    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)

    # Capture any legacy already-equipped item into `unlocked` BEFORE we mutate the loadout, so
    # clearing/swapping a slot can never drop a never-`unlocked` item from the owned set
    # (ownership stays monotonic — ADR-0027).
    spirit.unlocked = _reconciled_unlocked(spirit)

    equipped = dict(_cosmetics(spirit))
    if data.option is None:
        # Clear the slot (a no-op if already empty).
        equipped.pop(data.slot, None)
    else:
        # The option must exist AND belong to THIS slot (so a valid option from another slot
        # can't be equipped into the wrong one).
        if data.option not in SPIRIT_COSMETICS_CATALOG[data.slot]:
            raise UnknownCosmetic(data.option)
        if data.option not in _owned(spirit):
            raise NotOwned(data.option)
        equipped[data.slot] = data.option

    spirit.cosmetics = equipped
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz)


def reset_name(
    db: DBSession,
    user_id: uuid.UUID,
    data: ResetNameRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SpiritState:
    """Change the active spirit's name via a PAID reset (ADR-0024). The name is otherwise
    immutable (set once at `choose`). Charges RESET_COST against the balance — raises
    InsufficientCoins (409) when the balance can't cover it — adds it to the monotonic
    `coins_spent` ledger (no refund), and sets the new validated name.

    The name is already trimmed, required (non-empty), and length-capped by the schema
    (over-length / blank → 422 before we get here). Serialized under the per-user advisory
    lock so the read-compute-write of the fee is atomic.
    """
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    if _coin_balance(basis.level, spirit.coins_spent) < RESET_COST:
        raise InsufficientCoins("reset-name")

    spirit.name = data.name
    spirit.coins_spent = spirit.coins_spent + RESET_COST
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz, basis=basis)


def awaken(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC") -> SpiritState:
    """Retire the active spirit and awaken a fresh pathless spark — reachable when the spirit is
    radiant (the long-horizon goal) OR when it has DIED (ADR-0029: the "set free a new one" path
    from the memorial). Raises NotRadiant (409) when it is neither.

    Done in ONE transaction: the current row's `retired_at` is stamped and a new pathless spark is
    inserted, so the partial unique index (one active spirit per user) is never violated. A
    concurrent awaken loses the race on that index → SpiritConflictError (409). The fresh spark is
    genuinely new (coins_spent 0, empty unlocked, pathless, born fed).
    """
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    # ADR-0030: the radiant gate keys off the SPIRIT-LEVEL (its own life, XP since `awakened_at`) —
    # the same level that drives the stage — so a spirit graduates only once IT has grown to
    # radiant, not merely because the account's lifetime XP is high.
    spirit_basis = dashboard_service.get_wallet_basis(
        db, user_id, today=today, tz=tz, since=_as_aware(spirit.awakened_at)
    )
    is_radiant = stage_for_level(spirit_basis.level) == STAGE_BANDS[-1][0]
    # ADR-0029: a dead spirit can also be retired+awakened. Compute death here (lazily persisting
    # `died_at`) so the gate sees it even on the first read after death.
    dead, _ailing, _died_at = _resolve_health(
        db, user_id, spirit, now=datetime.now(UTC)
    )
    if not is_radiant and not dead:
        raise NotRadiant(str(spirit.id))

    # Retire the current spirit and insert the new spark together: stamping retired_at frees
    # the partial unique slot (WHERE retired_at IS NULL), so the fresh active row is valid. The new
    # spark is BORN FED (needs_baseline_at = now()), so it starts with full needs.
    spirit.retired_at = func.now()
    new_spark = Spirit(
        user_id=user_id, path=None, cosmetics={}, unlocked=[], needs_baseline_at=func.now()
    )
    db.add(new_spark)
    try:
        db.commit()
    except IntegrityError as err:
        # Another awaken committed first — the partial unique index caught the duplicate
        # active spirit. Roll back; the caller may retry.
        db.rollback()
        raise SpiritConflictError(str(user_id)) from err
    db.refresh(new_spark)
    return _build_state(db, user_id, new_spark, today=today, tz=tz, basis=basis)


# The tend `kind` → the need (and its stored stamp column) it tops up (ADR-0029).
_TEND_KIND_TO_COLUMN: dict[str, str] = {
    "feed": "nourished_tended_at",
    "rest": "rested_tended_at",
    "play": "joyful_tended_at",
}


def tend_spirit(
    db: DBSession, user_id: uuid.UUID, kind: str, *, today: date, tz: str = "UTC"
) -> SpiritState:
    """A manual TEND action (ADR-0029): Feed / Rest / Play. `kind` (`feed` | `rest` | `play`) maps
    to one need — feed → nourished, rest → rested, play → joyful — and stamps that need's
    `*_tended_at = now()`, lifting it to TEND_CAP via the decay formula (it then decays like
    practice). Tending an already-full-by-practice need is a harmless near-no-op (the `max` keeps
    the higher value). Returns the freshly built spirit state.

    A DEAD spirit cannot be tended → SpiritDead (the route maps it to a 409): death is terminal,
    so the user must awaken a new spirit. Serialized under the per-user advisory lock like the
    other writes. Tending is free (no coins) and works even on a pathless spark (it just feeds the
    stamp; a pathless spark's needs still read neutral)."""
    column = _TEND_KIND_TO_COLUMN.get(kind)
    if column is None:  # defensive — the schema already constrains `kind` to the three literals.
        raise ValueError(f"unknown tend kind {kind!r}")

    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)

    # A dead spirit is terminal — reject the tend (the memorial offers awaken instead). Compute
    # death lazily (persisting `died_at` if newly detected) so even a first read sees it.
    dead, _ailing, _died_at = _resolve_health(db, user_id, spirit, now=datetime.now(UTC))
    if dead:
        raise SpiritDead(str(spirit.id))

    setattr(spirit, column, func.now())
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz)

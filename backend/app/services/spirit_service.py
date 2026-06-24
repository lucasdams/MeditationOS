"""Spirit state — a single living companion grown from practice (docs/design/spirit.md,
ADR-0022, ADR-0023). Get-or-create the active spirit, compute its read-only state, and write
the choose / cosmetics / nickname / awaken loop.

Maximally computed (ADR-0009/0011): the only stored state is the active spirit row's
chosen `path`, optional `name`, and owned `cosmetics`. Everything the client sees is
derived on read from the user's earned-XP level (via `dashboard_service.get_wallet_basis`):

- **Stage** — the level band the user's level falls into (spark…radiant). A pure function
  of level, so it is monotonic and can never be lost.
- **Bond** — a friendly level read-out (level + XP-into-level + XP-for-next).
- **Coins** — `level × COINS_PER_LEVEL − Σ cosmetics spent`, clamped ≥ 0 (see
  `_coin_balance`). Self-contained: this module owns its own `COINS_PER_LEVEL` constant.
- **Needs** (ADR-0023) — THREE named care states (`nourished` / `rested` / `joyful`), each a
  tier + 0..1 factor, computed from the activity log over a rolling window. Demanding: they
  decline through tiers when neglected and recover only gradually on a concave curve.
  `nourished` tracks the CHOSEN creature's signature practice, `rested` its rhythm/consistency,
  `joyful` its variety. An overall **condition** is the weakest of the three. Together they
  replace ADR-0022's single `daily_glow`. GUARDRAIL: visual/advisory only — needs never touch
  stage, level, coins, cosmetics, or the collection, so progress stays monotonic and a
  neglected creature never loses anything.

ADR-0023 also makes the `path` USER-CHOSEN (set once via `choose_path` while pathless)
instead of auto-detected from the practice mix; the ADR-0022 `path_lean` and commit-on-read
are retired. The active spirit is lazily created (a pathless spark) on first read, so both
new users and migrated users get one without a heavy backfill.

Steps 5 + 6 add the writes — all user-scoped, default-deny at the route. Mutations serialize
concurrent same-user writes via a per-user, txn-scoped Postgres advisory lock so the
read-compute-write of a cosmetic purchase (or the retire+awaken swap) is atomic against a
parallel request — no double-spend, no two active spirits.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import Session
from app.models.spirit import Spirit
from app.schemas.spirit import (
    ChoosePathRequest,
    CosmeticsRequest,
    RenameRequest,
    RetiredSpirit,
    SpiritAvailableSlot,
    SpiritBond,
    SpiritCondition,
    SpiritNeed,
    SpiritNeeds,
    SpiritSlotOption,
    SpiritState,
)
from app.services import dashboard_service
from app.services.time_utils import MIN_PRACTICE_SECONDS, local_date

# The spirit's own economy constant: coins earned per level. The derived coin balance is
# `level × COINS_PER_LEVEL − Σ cosmetics spent`, clamped ≥ 0 (see `_coin_balance`).
COINS_PER_LEVEL = 80


def _coin_balance(level: int, cosmetics: dict[str, str]) -> int:
    """The derived coin balance: `level × COINS_PER_LEVEL − Σ cosmetics spent`, clamped ≥ 0.
    Single source of truth for the formula shared by the read state, purchases, and the
    affordability check."""
    return max(0, level * COINS_PER_LEVEL - _cosmetics_spent(cosmetics))

# --- Domain errors (mapped to HTTP in the route layer) ----------------------------------


class UnknownCosmetic(Exception):
    """The requested cosmetic slot or option is not in the catalog → 404."""


class CosmeticLocked(Exception):
    """The option's level requirement isn't met yet → 409."""


class InsufficientCoins(Exception):
    """Not enough coins for this cosmetic → 409."""


class AlreadyApplied(Exception):
    """The spirit already has that exact option in that slot — a no-op → 409."""


class PathAlreadyChosen(Exception):
    """The active spirit already has a chosen creature; the choice is once-only → 409."""


class NotRadiant(Exception):
    """Awaken requires the active spirit to be at the radiant stage → 409."""


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
#   stillness → Kapha (earth/water, heavy/slow)     — balanced by resonance BREATHING (energizing)
#   breath    → Pitta (fire/water, hot/intense)     — balanced by GRATITUDE + JOURNALING (cooling)
#   heart     → Vata  (air/ether, light/scattered)  — balanced by non-breathing MEDITATION (grounding)
#
# ADR-0023 retires ADR-0022's practice-auto-detected path and commit-on-read: the path is now
# CHOSEN ONCE by the user (via `choose_path`) and stored in the same `spirits.path` column. A
# fresh spark is pathless (path IS NULL) until the user picks.
STILLNESS = "stillness"
BREATH = "breath"
HEART = "heart"

# Each creature's preferred practice — the only practice that keeps it in good condition.
_CHOOSABLE_PATHS: frozenset[str] = frozenset({STILLNESS, BREATH, HEART})


# --- The three tended needs (demanding, visual-only care state) --------------------------
#
# ADR-0023 replaces the single `daily_glow` with THREE named needs, each a tier
# (thriving → content → restless → unwell) plus a 0..1 factor, all computed from the activity
# log over the same rolling window and all DEMANDING + SLOW TO RECOVER (they reflect a *count
# of distinct recent days*, mapped through a concave threshold curve, so one token session
# can't jump a depleted need to thriving — recovery is gradual and reflects sustained practice):
#
#   nourished — the chosen creature's SIGNATURE practice (the identity need):
#       stillness → non-breathing meditation days; breath → resonance-breathing days;
#       heart → gratitude-OR-journal days. ONLY this practice feeds it — doing a different
#       creature's practice does NOT nourish it.
#   rested  — practice RHYTHM / consistency: how steady the recent routine is. We take the
#       stronger of (distinct active days in the window) and (the current streak), so a solid
#       streak or a well-covered week both read as well-rested.
#   joyful  — practice VARIETY: how many DISTINCT practice types (meditate / breathe /
#       gratitude / journal) were done in the window — not overdoing one thing.
#
# All three share the SAME window and the SAME day→(tier,factor) curve (NEED_TIERS); the
# difference is only the signal each measures. The window length, the tier thresholds, and the
# concave factors are the tunable knobs (retuning needs no migration).
#
# GUARDRAIL (ADR-0023): needs are ADVISORY / VISUAL ONLY. They are never read by stage, level,
# coins, cosmetics, or the collection — those stay derived from earned XP and remain monotonic.
# `unwell` is the floor; the creature never dies and the right practice always recovers it.

# The rolling window: how many days back (including today) recent activity counts.
CONDITION_WINDOW_DAYS = 7

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

# Each need maps a COUNT (of distinct recent days, or of distinct practice types for joyful)
# to a (tier, factor) on a concave/demanding curve. Thriving needs the signal sustained across
# most of the window, while a single recent day only lifts a need off the unwell floor — so a
# token session can't jump a depleted need to the top. Ordered best → worst; first satisfied
# threshold wins. Shared by all three needs (the signals differ, the curve does not).
#   (tier, min count for this tier, factor for this tier)
NEED_TIERS: tuple[tuple[str, int, float], ...] = (
    (CONDITION_THRIVING, 5, 1.0),
    (CONDITION_CONTENT, 3, 0.8),
    (CONDITION_RESTLESS, 1, 0.6),
    (CONDITION_UNWELL, 0, 0.4),
)

# The variety (`joyful`) need saturates faster than the day-count needs — there are only four
# practice types, so its thresholds are scaled down: all four types → thriving, etc. Same
# concave shape, just keyed to "distinct types done" instead of "distinct days practiced".
JOYFUL_TIERS: tuple[tuple[str, int, float], ...] = (
    (CONDITION_THRIVING, 4, 1.0),
    (CONDITION_CONTENT, 3, 0.8),
    (CONDITION_RESTLESS, 1, 0.6),
    (CONDITION_UNWELL, 0, 0.4),
)

# A pathless spark (no creature chosen yet) has no care requirement — every need reports a
# neutral, content-ish default rather than declining.
_NEUTRAL_CONDITION_TIER = CONDITION_CONTENT
_NEUTRAL_CONDITION_FACTOR = 0.8

# Minutes-based practices count a day only once its session time reaches MIN_PRACTICE_SECONDS
# (the same floor streaks/heatmaps use), so a 1-second sit can't prop up a need.


def _tier_for_count(
    count: int, tiers: tuple[tuple[str, int, float], ...] = NEED_TIERS
) -> tuple[str, float]:
    """Map a count to a (tier, factor) on the demanding curve. The first threshold (best →
    worst) the count satisfies wins; the floor is always `unwell` (count 0)."""
    for tier, min_count, factor in tiers:
        if count >= min_count:
            return tier, factor
    # `tiers` always ends at a 0 floor, so this is unreachable; kept for total-ness.
    return CONDITION_UNWELL, tiers[-1][2]


def _signature_care_days(
    db: DBSession, path: str, user_id: uuid.UUID, *, window_start: date, today: date, tz: str
) -> int:
    """Distinct recent local days the user did `path`'s SIGNATURE practice, in the window. The
    `nourished` signal — only the chosen creature's own practice counts. The practice is the one
    that BALANCES that dosha (Ayurveda balances by *opposites*), not the one matching its element:

    - stillness (Kapha — heavy/slow) → resonance BREATHING (energizing balances Kapha)
    - breath    (Pitta — hot/intense) → a GRATITUDE or JOURNAL entry (cooling contentment balances Pitta)
    - heart     (Vata — light/scattered) → non-breathing MEDITATION (grounding balances Vata)
    """
    if path in (STILLNESS, HEART):
        # Session-based signatures: Kapha (stillness) is energized by resonance breathing; Vata
        # (heart) is grounded by non-breathing meditation.
        is_breathing = path == STILLNESS
        session_day = local_date(tz, Session.occurred_at)
        days = db.execute(
            select(session_day)
            .where(
                Session.user_id == user_id,
                (Session.type == "resonance_breathing")
                if is_breathing
                else (Session.type != "resonance_breathing"),
                session_day >= window_start,
                session_day <= today,
            )
            .group_by(session_day)
            # A day counts only once its signature-practice time meets the floor.
            .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
        ).all()
        return len(days)

    # breath (Pitta) → distinct local days with a gratitude OR journal entry (cooling) in the window.
    grat_day = local_date(tz, GratitudeEntry.created_at)
    grat_days = db.execute(
        select(grat_day)
        .where(
            GratitudeEntry.user_id == user_id,
            grat_day >= window_start,
            grat_day <= today,
        )
        .group_by(grat_day)
    ).scalars().all()
    journal_day = local_date(tz, Journal.created_at)
    journal_days = db.execute(
        select(journal_day)
        .where(
            Journal.user_id == user_id,
            journal_day >= window_start,
            journal_day <= today,
        )
        .group_by(journal_day)
    ).scalars().all()
    return len(set(grat_days) | set(journal_days))


def _active_days_in_window(
    db: DBSession, user_id: uuid.UUID, *, window_start: date, today: date, tz: str
) -> int:
    """Distinct local days in the window with real practice (any session totalling at least
    MIN_PRACTICE_SECONDS) — the consistency half of the `rested` signal, mirroring the
    streak/heatmap practice-day rule the dashboard already uses."""
    session_day = local_date(tz, Session.occurred_at)
    rows = db.execute(
        select(session_day)
        .where(
            Session.user_id == user_id,
            session_day >= window_start,
            session_day <= today,
        )
        .group_by(session_day)
        .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
    ).all()
    return len(rows)


def _distinct_practice_types_in_window(
    db: DBSession, user_id: uuid.UUID, *, window_start: date, today: date, tz: str
) -> int:
    """How many of the four practice TYPES (meditate / breathe / gratitude / journal) the user
    did in the window — the `joyful` (variety) signal. Meditate vs breathe split the same way
    the rest of the app does (resonance_breathing vs everything else); each minutes-based type
    must clear MIN_PRACTICE_SECONDS total in-window so a 1-second sit can't pad variety."""
    types = 0
    session_day = local_date(tz, Session.occurred_at)
    # Meditate (non-breathing) and breathe (resonance) — each counts as a type once its
    # in-window total clears the practice floor.
    secs_by_kind = db.execute(
        select(
            (Session.type == "resonance_breathing").label("is_breathing"),
            func.sum(Session.duration_seconds),
        )
        .where(
            Session.user_id == user_id,
            session_day >= window_start,
            session_day <= today,
        )
        .group_by("is_breathing")
    ).all()
    for _is_breathing, total in secs_by_kind:
        if int(total or 0) >= MIN_PRACTICE_SECONDS:
            types += 1

    # Gratitude and journal — any entry in the window counts that type.
    grat_day = local_date(tz, GratitudeEntry.created_at)
    has_gratitude = db.execute(
        select(GratitudeEntry.id)
        .where(
            GratitudeEntry.user_id == user_id,
            grat_day >= window_start,
            grat_day <= today,
        )
        .limit(1)
    ).first()
    if has_gratitude is not None:
        types += 1
    journal_day = local_date(tz, Journal.created_at)
    has_journal = db.execute(
        select(Journal.id)
        .where(
            Journal.user_id == user_id,
            journal_day >= window_start,
            journal_day <= today,
        )
        .limit(1)
    ).first()
    if has_journal is not None:
        types += 1
    return types


def _neutral_need() -> SpiritNeed:
    """A pathless spark's neutral, content-ish need (no care requirement until a creature is
    chosen)."""
    return SpiritNeed(tier=_NEUTRAL_CONDITION_TIER, factor=_NEUTRAL_CONDITION_FACTOR)


def needs(
    db: DBSession,
    path: str | None,
    user_id: uuid.UUID,
    *,
    today: date,
    tz: str,
    current_streak: int = 0,
) -> SpiritNeeds:
    """The active creature's three tended needs (ADR-0023) over the rolling window. Demanding:
    each declines through the tiers when its signal is neglected and recovers only gradually.

    A pathless spark (path is None) has no chosen creature, so every need returns a neutral,
    content-ish default rather than a care requirement.

    `current_streak` (the dashboard's value) feeds `rested` so a strong streak reads as
    well-rested even before the active-day count fills.

    GUARDRAIL: visual/advisory only — the caller must never let any need affect stage, level,
    coins, cosmetics, or the collection.
    """
    if path is None or path not in _CHOOSABLE_PATHS:
        neutral = _neutral_need()
        return SpiritNeeds(nourished=neutral, rested=neutral, joyful=neutral)

    window_start = today - timedelta(days=CONDITION_WINDOW_DAYS - 1)

    # nourished — the signature-practice care days.
    care_days = _signature_care_days(
        db, path, user_id, window_start=window_start, today=today, tz=tz
    )
    nourished_tier, nourished_factor = _tier_for_count(care_days)

    # rested — rhythm/consistency: the stronger of recent active days and the current streak
    # (capped at the window so a long streak doesn't overflow the day-count curve).
    active_days = _active_days_in_window(
        db, user_id, window_start=window_start, today=today, tz=tz
    )
    rhythm = min(max(active_days, current_streak), CONDITION_WINDOW_DAYS)
    rested_tier, rested_factor = _tier_for_count(rhythm)

    # joyful — variety: how many distinct practice types were done in the window.
    variety = _distinct_practice_types_in_window(
        db, user_id, window_start=window_start, today=today, tz=tz
    )
    joyful_tier, joyful_factor = _tier_for_count(variety, JOYFUL_TIERS)

    return SpiritNeeds(
        nourished=SpiritNeed(tier=nourished_tier, factor=nourished_factor),
        rested=SpiritNeed(tier=rested_tier, factor=rested_factor),
        joyful=SpiritNeed(tier=joyful_tier, factor=joyful_factor),
    )


def overall_condition(spirit_needs: SpiritNeeds) -> SpiritCondition:
    """The overall care state = the WEAKEST of the three needs (ADR-0023), so the frontend can
    render one summary look. Ties on tier are broken by the lower factor. Visual-only."""
    weakest = min(
        (spirit_needs.nourished, spirit_needs.rested, spirit_needs.joyful),
        key=lambda n: (_TIER_RANK[n.tier], n.factor),
    )
    return SpiritCondition(tier=weakest.tier, factor=weakest.factor)


# --- Cosmetics economy (step 5: repoint the derived wallet at spirit slots) -------------
#
# The owned cosmetics ARE the spend ledger (ADR-0011), repointed from garden items to the
# one spirit. Each slot offers a few mutually-exclusive options; choosing one within a slot
# excludes the others (a swap charges only the difference, like the Sanctuary). Costs spend
# from the derived coin balance (`level × COINS_PER_LEVEL − Σ owned-option cost`).
#
# Kept calm and modest, on-theme (docs/design/spirit.md "Coins"): a soft aura, a small
# accessory, and a habitat/backdrop the spirit sits in. The Sanctuary's progressive
# anti-hoarding surcharge is intentionally dropped — there is one subject now, so the
# hoarding problem it solved no longer exists. All costs/unlock levels are tunable in-code
# constants — retuning needs no migration. An optional per-option `unlock_level` gates a
# couple of richer options behind a little growth (default 1 = always available).
#
# APPEND-ONLY / STABLE FOR OWNED KEYS. `_cosmetics_spent`/`_option_cost` price an owned
# option from this catalog and fall back to 0 for anything missing. Removing or renaming a
# slot/option that a user could already own would silently refund its coins (drop the spend
# from the ledger), inflating the derived balance. So: never delete or rename an owned key —
# only add new slots/options, and only re-tune costs of options nobody owns. Test
# `test_owned_options_all_price_above_zero` guards against an owned key being dropped.
SPIRIT_COSMETICS_CATALOG: dict[str, dict[str, dict[str, int]]] = {
    # {slot: {option: {"cost": int, "unlock_level": int}}}
    # A soft surrounding glow — the gentlest touch, available from the start.
    "aura": {
        "soft": {"cost": 30, "unlock_level": 1},
        "warm": {"cost": 45, "unlock_level": 1},
        "starlit": {"cost": 70, "unlock_level": 5},
    },
    # A small worn accessory.
    "accessory": {
        "halo": {"cost": 40, "unlock_level": 1},
        "leaf_crown": {"cost": 55, "unlock_level": 1},
        "ribbon": {"cost": 35, "unlock_level": 1},
    },
    # A small backdrop the spirit sits in (the "habitat").
    "habitat": {
        "meadow": {"cost": 50, "unlock_level": 1},
        "dusk": {"cost": 65, "unlock_level": 3},
        "night": {"cost": 80, "unlock_level": 7},
    },
}


def _option_cost(slot: str, option: str) -> int:
    """The coin cost of a catalog option (0 for unknown slot/option — never a phantom charge)."""
    return SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("cost", 0)


def _option_unlock_level(slot: str, option: str) -> int:
    """The level an option unlocks at (1 = always available; unknown → 1)."""
    return SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, {}).get("unlock_level", 1)


def _cosmetics(spirit: Spirit) -> dict[str, str]:
    """The spirit's owned cosmetics, defensively normalized to {str: str}. A fresh/legacy
    spark has {} → no spend, exactly the base form."""
    raw = spirit.cosmetics or {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if isinstance(v, (str, int))}


def _cosmetics_spent(cosmetics: dict[str, str]) -> int:
    """Σ cost of the owned cosmetics, summed from SPIRIT_COSMETICS_CATALOG. The owned options
    ARE the spend ledger, so the coin formula stays fully derived. Unknown slots/options are
    ignored (never a negative or phantom charge)."""
    total = 0
    for slot, option in cosmetics.items():
        total += _option_cost(slot, option)
    return total


def _available_slots(
    cosmetics: dict[str, str], balance: int, level: int
) -> list[SpiritAvailableSlot]:
    """The cosmetics catalog with per-option state — the same calm "personalize" shape the
    Sanctuary panel uses: each option's cost plus unlocked / affordable / applied hints.

    `affordable` is computed against the *net* cost of a swap (the new option's cost minus
    what is already sunk in this slot), so the client's affordability gate matches exactly
    what `buy_cosmetic` will deduct — an already-owned-slot swap to a cheaper option always
    reads affordable, and a more expensive one only when the difference is covered.
    """
    out: list[SpiritAvailableSlot] = []
    for slot, options in SPIRIT_COSMETICS_CATALOG.items():
        applied = cosmetics.get(slot)
        already_in_slot = _option_cost(slot, applied) if applied is not None else 0
        opts: list[SpiritSlotOption] = []
        for option, spec in options.items():
            unlock_level = spec["unlock_level"]
            unlocked = level >= unlock_level
            net_cost = spec["cost"] - already_in_slot
            opts.append(
                SpiritSlotOption(
                    option=option,
                    cost=spec["cost"],
                    unlocked=unlocked,
                    unlock_hint=None if unlocked else f"Reach level {unlock_level}",
                    affordable=balance >= net_cost,
                    applied=applied == option,
                )
            )
        out.append(SpiritAvailableSlot(slot=slot, applied=applied, options=opts))
    return out


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

    spirit = Spirit(user_id=user_id, path=None, cosmetics={})
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
    """The user's retired spirits — past radiant companions, kept forever (the replay loop).
    A retired spirit is stamped at radiant, so it reports the radiant stage; ordered most
    recently retired first. Empty for a user who has never awakened a new spark."""
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
            stage=STAGE_BANDS[-1][0],  # retired only at radiant (the final stage)
            path=row.path,
            name=row.name,
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
    level = basis.level

    cosmetics = _cosmetics(spirit)
    coins = _coin_balance(level, cosmetics)

    # GUARDRAIL (ADR-0023): the three needs (and the overall condition derived from them) are
    # visual-only — they are NOT read by stage/coins above, so a neglected creature never loses
    # progress. Derived from the chosen creature's signature practice / rhythm / variety; a
    # pathless spark gets neutral defaults. `current_streak` (from the same wallet basis) feeds
    # the `rested` rhythm signal.
    spirit_needs = needs(
        db,
        spirit.path,
        user_id,
        today=today,
        tz=tz,
        current_streak=basis.current_streak,
    )

    return SpiritState(
        stage=stage_for_level(level),
        path=spirit.path,
        name=spirit.name,
        # `bond.level` is the user's *earned-XP* level (the same basis that funds stage and
        # coins), so the spirit stays monotonic with its own economy. This is deliberately the
        # earned-XP basis and can read LOWER than the dashboard's headline level during an
        # active streak (the dashboard adds streak-bonus XP that earned XP excludes). Intended,
        # not a bug — keeping the spirit on earned XP makes its progress un-loseable.
        bond=SpiritBond(
            level=level,
            xp_into_level=basis.xp_into_level,
            xp_for_next=basis.xp_for_next,
        ),
        needs=spirit_needs,
        # The overall condition is the weakest of the three needs — one summary look for the UI.
        condition=overall_condition(spirit_needs),
        coins=coins,
        cosmetics=cosmetics,
        available=_available_slots(cosmetics, coins, level),
        collection=_collection(db, user_id),
    )


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
    """Choose the active creature ONCE (ADR-0023). Sets `path` only while it is currently
    NULL; a re-choose raises PathAlreadyChosen (409). The schema already constrains `path` to
    a valid enum value (bad value → 422 before we get here).

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
        .values(path=data.path)
    )
    db.commit()
    if not result.rowcount:
        # A concurrent choose set it first — the choice is once-only, so this loses.
        db.refresh(spirit)
        raise PathAlreadyChosen(str(spirit.id))
    spirit.path = data.path
    return _build_state(db, user_id, spirit, today=today, tz=tz)


def buy_cosmetic(
    db: DBSession,
    user_id: uuid.UUID,
    data: CosmeticsRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SpiritState:
    """Buy/apply a cosmetic option to a slot on the active spirit.

    Validates: unknown slot/option → UnknownCosmetic (404); option not unlocked by level →
    CosmeticLocked (409); already the applied option → AlreadyApplied (409); can't afford the
    net cost → InsufficientCoins (409). A within-slot swap charges only the difference (the
    new option's cost minus what's already sunk in that slot), mirroring the Sanctuary, so a
    swap is never punishing and the derived balance stays consistent with `_cosmetics_spent`.
    """
    # Validate the catalog request before taking the lock (pure, no DB).
    if data.slot not in SPIRIT_COSMETICS_CATALOG:
        raise UnknownCosmetic(data.slot)
    if data.option not in SPIRIT_COSMETICS_CATALOG[data.slot]:
        raise UnknownCosmetic(data.option)

    # Lock FIRST — so the affordability math AND the cosmetics map we merge onto are read
    # under the per-user lock; a concurrent buy otherwise reads a stale snapshot and could
    # double-spend or clobber the JSON column (last-writer-wins).
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)
    current = _cosmetics(spirit)
    if current.get(data.slot) == data.option:
        raise AlreadyApplied(data.option)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    level = basis.level
    if level < _option_unlock_level(data.slot, data.option):
        raise CosmeticLocked(data.option)

    # Charge only the difference: swapping within a slot costs the new option over what is
    # already sunk in that slot, so the balance stays consistent with `_cosmetics_spent`.
    already_in_slot = _option_cost(data.slot, current[data.slot]) if data.slot in current else 0
    net_cost = _option_cost(data.slot, data.option) - already_in_slot
    balance = _coin_balance(level, current)
    if balance < net_cost:
        raise InsufficientCoins(data.option)

    updated = dict(current)
    updated[data.slot] = data.option
    spirit.cosmetics = updated
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz, basis=basis)


def rename_spirit(
    db: DBSession,
    user_id: uuid.UUID,
    data: RenameRequest,
    *,
    today: date,
    tz: str = "UTC",
) -> SpiritState:
    """Set or clear the active spirit's nickname. Purely cosmetic — never changes coins.

    The name is already trimmed, capped, and empty→None by the schema (over-length → 422
    before we get here). Always present in a PATCH body (defaults to None = clear), so we
    write it unconditionally.
    """
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)
    spirit.name = data.name
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz)


def awaken(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str = "UTC") -> SpiritState:
    """Retire the active spirit and awaken a fresh pathless spark — but only once it is
    radiant (the long-horizon goal). Raises NotRadiant (409) otherwise.

    Done in ONE transaction: the current row's `retired_at` is stamped and a new pathless
    spark is inserted, so the partial unique index (one active spirit per user) is never
    violated. A concurrent awaken loses the race on that index → SpiritConflictError (409).
    """
    _lock_user_spirit(db, user_id)
    spirit = get_or_create_active_spirit(db, user_id)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    if stage_for_level(basis.level) != STAGE_BANDS[-1][0]:  # not radiant
        raise NotRadiant(str(spirit.id))

    # Retire the current spirit and insert the new spark together: stamping retired_at frees
    # the partial unique slot (WHERE retired_at IS NULL), so the fresh active row is valid.
    spirit.retired_at = func.now()
    new_spark = Spirit(user_id=user_id, path=None, cosmetics={})
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

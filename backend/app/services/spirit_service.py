"""Spirit state — a single living companion grown from practice (docs/design/spirit.md,
ADR-0022). Get-or-create the active spirit, compute its read-only state, and (steps 5 + 6)
write its cosmetics, nickname, and the awaken / collection loop.

Maximally computed (ADR-0009/0011): the only stored state is the active spirit row's
committed `path`, optional `name`, and owned `cosmetics`. Everything the client sees is
derived on read from the user's earned-XP level (via the same
`dashboard_service.get_wallet_basis` the Sanctuary wallet uses):

- **Stage** — the level band the user's level falls into (spark…radiant). A pure function
  of level, so it is monotonic and can never be lost.
- **Bond** — a friendly level read-out (level + XP-into-level + XP-for-next).
- **Coins** — `level × COINS_PER_LEVEL − Σ cosmetics spent`, clamped ≥ 0. The coin formula
  and `COINS_PER_LEVEL` are reused verbatim from `sanctuary_service` (no duplication).
- **Daily glow** — a brightness factor in [GLOW_FLOOR, 1.0] from recent practice, floored
  so the spirit never goes dark. Visual only, never destructive.

The active spirit is lazily created (a pathless spark) on first read, so both new users and
migrated users get one without a heavy backfill.

Steps 5 + 6 add the writes — all user-scoped, default-deny at the route. Mutations serialize
concurrent same-user writes via a per-user, txn-scoped Postgres advisory lock (mirroring
`sanctuary_service`) so the read-compute-write of a cosmetic purchase (or the retire+awaken
swap) is atomic against a parallel request — no double-spend, no two active spirits.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import Session
from app.models.spirit import Spirit
from app.schemas.spirit import (
    CosmeticsRequest,
    RenameRequest,
    RetiredSpirit,
    SpiritAvailableSlot,
    SpiritBond,
    SpiritSlotOption,
    SpiritState,
)
from app.services import dashboard_service
from app.services.dashboard_service import (
    BREATHING_XP_MULTIPLIER,
    MEDITATION_XP_PER_MIN,
)
from app.services.gratitude_service import GRATITUDE_XP
from app.services.journal_service import JOURNAL_XP
from app.services.sanctuary_service import COINS_PER_LEVEL
from app.services.time_utils import MIN_PRACTICE_SECONDS, local_date

# --- Domain errors (mapped to HTTP in the route layer) ----------------------------------


class UnknownCosmetic(Exception):
    """The requested cosmetic slot or option is not in the catalog → 404."""


class CosmeticLocked(Exception):
    """The option's level requirement isn't met yet → 409."""


class InsufficientCoins(Exception):
    """Not enough coins for this cosmetic → 409."""


class AlreadyApplied(Exception):
    """The spirit already has that exact option in that slot — a no-op → 409."""


class NotRadiant(Exception):
    """Awaken requires the active spirit to be at the radiant stage → 409."""


class SpiritConflictError(Exception):
    """A concurrent write to the same user's spirit collided on the partial unique index
    (two active spirits). The route maps this to 409, not 500."""


def _lock_user_spirit(db: DBSession, user_id: uuid.UUID) -> None:
    """Serialize concurrent *writes* to one user's spirit by taking a transaction-scoped
    Postgres advisory lock keyed on the user (mirrors `sanctuary_service._lock_user_garden`).
    Held until the surrounding transaction commits/rolls back, so it spans the
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


# --- Path branching (the lifetime practice-mix lean + commit) ---------------------------
#
# The three paths the spirit can grow down (docs/design/spirit.md, "The standout hook"):
#   stillness → a serene mini Buddha   (meditation-dominant)
#   breath    → an airy wind spirit    (resonance-breathing-dominant)
#   heart     → a blooming heart spirit (gratitude + journaling dominant)
#
# The dominant path is COMPUTED from the user's *lifetime* practice mix, weighted by the same
# value system the XP economy uses (meditation ×2 per minute, resonance breathing ×3 per
# minute, gratitude/journal per entry — GRATITUDE_XP/JOURNAL_XP). Crucially the volume is
# UNCAPPED lifetime (raw minutes, raw entry counts) — not the daily-XP-capped figures — so the
# lean reflects genuine long-run preference rather than the anti-farm daily ceiling. Gratitude
# and journaling sum into one `heart` bucket (three paths from four practice categories).
#
# Tie-break: a fixed priority order `stillness > breath > heart`, so the result is fully
# deterministic when two buckets are equal. A brand-new user with no practice at all has every
# bucket at 0, which the tie-break resolves to `stillness` — a calm, on-brand default for a
# stillness-first meditation app, and the spark a user with no history first leans toward.
STILLNESS = "stillness"
BREATH = "breath"
HEART = "heart"

# The commit stage: the spirit crystallizes its path here and never changes it again. Per the
# design's stage table this is `wisp` (level ≥ 3) — the second stage. Derived from the band
# constant so retuning STAGE_BANDS keeps the two in step (no second source of truth).
PATH_COMMIT_STAGE = STAGE_BANDS[1][0]  # "wisp"

# Fixed tie-break priority — earlier wins when buckets are equal. Also the new-user default
# (all-zero buckets resolve to the first entry).
_PATH_PRIORITY: tuple[str, ...] = (STILLNESS, BREATH, HEART)


def _practice_weights(db: DBSession, user_id: uuid.UUID) -> dict[str, float]:
    """The user's lifetime, UNCAPPED, value-weighted practice volume per path bucket.

    Reuses the XP economy's weights so the lean matches what the app already treats as
    valuable, but on raw lifetime volume (not the daily-capped XP figures) so it reflects
    genuine preference:

    - stillness = lifetime non-breathing minutes × MEDITATION_XP_PER_MIN
    - breath    = lifetime resonance-breathing minutes × BREATHING_XP_MULTIPLIER
    - heart     = (lifetime gratitude entries + journal entries) × per-entry XP

    Minutes are floored per whole minute, consistent with the XP curve (a sub-minute sit is
    worth 0). All values ≥ 0; a user with no practice gets all zeros.
    """
    is_breathing = Session.type == "resonance_breathing"
    # Lifetime whole minutes by breathing / non-breathing (one grouped query).
    minute_rows = db.execute(
        select(
            is_breathing.label("breathing"),
            func.coalesce(func.sum(Session.duration_seconds), 0) / 60,
        )
        .where(Session.user_id == user_id)
        .group_by(is_breathing)
    ).all()
    breathing_minutes = 0
    meditation_minutes = 0
    for breathing, minutes in minute_rows:
        if breathing:
            breathing_minutes = int(minutes)
        else:
            meditation_minutes = int(minutes)

    gratitude_count = int(
        db.execute(
            select(func.count(GratitudeEntry.id)).where(GratitudeEntry.user_id == user_id)
        ).scalar_one()
    )
    journal_count = int(
        db.execute(
            select(func.count(Journal.id)).where(Journal.user_id == user_id)
        ).scalar_one()
    )

    return {
        STILLNESS: meditation_minutes * MEDITATION_XP_PER_MIN,
        BREATH: breathing_minutes * BREATHING_XP_MULTIPLIER,
        HEART: (gratitude_count + journal_count) * ((GRATITUDE_XP + JOURNAL_XP) / 2),
    }


def path_lean(db: DBSession, user_id: uuid.UUID) -> str:
    """The suggested path from the user's lifetime, value-weighted practice mix.

    Picks the highest-weighted bucket; ties (including the all-zero brand-new user) resolve by
    the fixed `_PATH_PRIORITY` order (stillness > breath > heart). A pure read — never writes.
    """
    weights = _practice_weights(db, user_id)
    # Max by weight, tie-broken by the fixed priority (lower index wins on equal weight).
    return max(_PATH_PRIORITY, key=lambda p: (weights[p], -_PATH_PRIORITY.index(p)))


def _stage_at_or_after_commit(level: int) -> bool:
    """True once the user's level reaches the commit stage's band or beyond. Compared by band
    index so it stays correct as STAGE_BANDS is retuned."""
    order = [name for name, _ in STAGE_BANDS]
    return order.index(stage_for_level(level)) >= order.index(PATH_COMMIT_STAGE)


def _maybe_commit_path(db: DBSession, spirit: Spirit, *, level: int, lean: str) -> None:
    """Crystallize the spirit's path ONCE, at/after the commit stage, if still uncommitted.

    The GET endpoint writes-on-read here (precedent: get-or-create already does). The commit
    is idempotent and safe:

    - It only fires when the active spirit is at/above PATH_COMMIT_STAGE AND `path IS NULL`,
      so a spirit that already committed is never touched again — the stored path never changes
      even if the lean later shifts (that hysteresis is the whole point of storing it).
    - It is guarded by a conditional UPDATE (`... WHERE id = :id AND path IS NULL`) inside its
      own transaction, so a concurrent request can't double-commit or clobber a value; the
      losing writer's UPDATE simply matches 0 rows. The in-memory `path` is then synced to the
      committed value (ours, or the winner's via a refresh).
    """
    if spirit.path is not None or not _stage_at_or_after_commit(level):
        return

    # Conditional, idempotent write: only set path if it is still NULL (race-safe).
    result = db.execute(
        Spirit.__table__.update()
        .where(Spirit.id == spirit.id, Spirit.path.is_(None))
        .values(path=lean)
    )
    db.commit()
    if result.rowcount:
        spirit.path = lean
    else:
        # Another request committed first (or it was already set) — adopt the stored value.
        db.refresh(spirit)


# --- Daily glow (visual-only brightness from recent practice) ---------------------------
#
# A floored brightness factor in [GLOW_FLOOR, 1.0]: practiced today → full glow; within the
# last couple of days → a mid glow; otherwise the resting floor. Never 0 — lapsing dims, it
# never harms (ADR-0022). Tunable constants; visual only.
GLOW_FULL = 1.0
GLOW_MID = 0.7
GLOW_FLOOR = 0.4
# Practice within this many days of "today" still counts as recent enough for the mid glow.
GLOW_RECENT_DAYS = 2


def _days_since_last_practice(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str
) -> int | None:
    """Whole days between `today` and the user's most recent practice day (in their local
    timezone), or None if they have never practiced. A day counts as practice only once its
    total session time reaches MIN_PRACTICE_SECONDS — the same floor streaks/heatmaps use,
    so a 1-second sit can't brighten the spirit.
    """
    session_day = local_date(tz, Session.occurred_at)
    last_day = db.execute(
        select(session_day)
        .where(Session.user_id == user_id)
        .group_by(session_day)
        .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
        .order_by(session_day.desc())
        .limit(1)
    ).scalar_one_or_none()
    if last_day is None:
        return None
    return (today - last_day).days


def daily_glow(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> float:
    """The spirit's surface brightness from recent practice, floored so it never goes dark.

    Practiced today → GLOW_FULL; within GLOW_RECENT_DAYS → GLOW_MID; otherwise GLOW_FLOOR.
    Purely visual and non-destructive — a lapse only dims the surface, never harms progress.
    """
    days = _days_since_last_practice(db, user_id, today=today, tz=tz)
    if days is None:
        return GLOW_FLOOR
    if days <= 0:
        return GLOW_FULL
    if days <= GLOW_RECENT_DAYS:
        return GLOW_MID
    return GLOW_FLOOR


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
        .order_by(Spirit.retired_at.desc())
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
) -> SpiritState:
    """Assemble the active spirit's computed read state from a (committed) spirit row plus
    the user's wallet basis. Shared by the read endpoint and every write so the response
    shape is built once."""
    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    level = basis.level

    cosmetics = _cosmetics(spirit)
    coins = max(0, level * COINS_PER_LEVEL - _cosmetics_spent(cosmetics))

    return SpiritState(
        stage=stage_for_level(level),
        path=spirit.path,
        path_lean=path_lean(db, user_id),
        name=spirit.name,
        bond=SpiritBond(
            level=level,
            xp_into_level=basis.xp_into_level,
            xp_for_next=basis.xp_for_next,
        ),
        daily_glow=daily_glow(db, user_id, today=today, tz=tz),
        coins=coins,
        cosmetics=cosmetics,
        available=_available_slots(cosmetics, coins, level),
        collection=_collection(db, user_id),
    )


def get_spirit(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> SpiritState:
    """The active spirit's computed state: stage, path (committed or NULL), the suggested
    path lean, bond, daily glow, coins, owned cosmetics + the catalog with per-option state,
    and the retired collection. Get-or-creates the spark on first read, and — at/after the
    commit stage — crystallizes the path once (write-on-read)."""
    spirit = get_or_create_active_spirit(db, user_id)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    # Crystallize the path once at/after the commit stage (idempotent write-on-read).
    _maybe_commit_path(db, spirit, level=basis.level, lean=path_lean(db, user_id))

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
    balance = max(0, level * COINS_PER_LEVEL - _cosmetics_spent(current))
    if balance < net_cost:
        raise InsufficientCoins(data.option)

    updated = dict(current)
    updated[data.slot] = data.option
    spirit.cosmetics = updated
    db.commit()
    db.refresh(spirit)
    return _build_state(db, user_id, spirit, today=today, tz=tz)


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
    return _build_state(db, user_id, new_spark, today=today, tz=tz)

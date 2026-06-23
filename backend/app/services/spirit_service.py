"""Spirit state — a single living companion grown from practice (docs/design/spirit.md,
ADR-0022). Step 1: get-or-create the active spirit and compute its read-only state.

Maximally computed (ADR-0009/0011): the only stored state is the active spirit row's
committed `path` (NULL in step 1 — no branching yet), optional `name`, and owned
`cosmetics`. Everything the client sees is derived on read from the user's earned-XP
level (via the same `dashboard_service.get_wallet_basis` the Sanctuary wallet uses):

- **Stage** — the level band the user's level falls into (spark…radiant). A pure function
  of level, so it is monotonic and can never be lost.
- **Bond** — a friendly level read-out (level + XP-into-level + XP-for-next).
- **Coins** — `level × COINS_PER_LEVEL − Σ cosmetics spent`, clamped ≥ 0. The coin formula
  and `COINS_PER_LEVEL` are reused verbatim from `sanctuary_service` (no duplication).
- **Daily glow** — a brightness factor in [GLOW_FLOOR, 1.0] from recent practice, floored
  so the spirit never goes dark. Visual only, never destructive.

The active spirit is lazily created (a pathless spark) on first read, so both new users and
migrated users get one without a heavy backfill.
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
from app.schemas.spirit import SpiritBond, SpiritState
from app.services import dashboard_service
from app.services.dashboard_service import (
    BREATHING_XP_MULTIPLIER,
    MEDITATION_XP_PER_MIN,
)
from app.services.gratitude_service import GRATITUDE_XP
from app.services.journal_service import JOURNAL_XP
from app.services.sanctuary_service import COINS_PER_LEVEL
from app.services.time_utils import MIN_PRACTICE_SECONDS, local_date

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


# --- Cosmetics spend (forward-compatible; empty in step 1) ------------------------------
#
# The owned cosmetics ARE the spend ledger (ADR-0011), repointed from garden items to the
# spirit. The cosmetics catalog/shop is a later step (build-order step 5); for now there are
# no buyable options, so a spirit's spend is always 0. `_cosmetics_spent` is written to sum
# option costs from this (currently empty) catalog so the coin formula stays correct the
# moment cosmetics ship — no change to the formula here.
SPIRIT_COSMETICS_CATALOG: dict[str, dict[str, int]] = {}  # {slot: {option: cost}}


def _cosmetics(spirit: Spirit) -> dict[str, str]:
    """The spirit's owned cosmetics, defensively normalized to {str: str}. A fresh/legacy
    spark has {} → no spend, exactly the base form."""
    raw = spirit.cosmetics or {}
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if isinstance(v, (str, int))}


def _cosmetics_spent(cosmetics: dict[str, str]) -> int:
    """Σ cost of the owned cosmetics, summed from SPIRIT_COSMETICS_CATALOG. 0 in step 1
    (empty catalog); forward-compatible so the coin formula is correct once cosmetics ship.
    Unknown slots/options are ignored (never a negative or phantom charge)."""
    total = 0
    for slot, option in cosmetics.items():
        total += SPIRIT_COSMETICS_CATALOG.get(slot, {}).get(option, 0)
    return total


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


def get_spirit(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> SpiritState:
    """The active spirit's computed state: stage, path (committed or NULL), the suggested
    path lean, bond, daily glow, coins, and owned cosmetics. Get-or-creates the spark on first
    read, and — at/after the commit stage — crystallizes the path once (write-on-read)."""
    spirit = get_or_create_active_spirit(db, user_id)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    level = basis.level
    xp_into_level = basis.xp_into_level
    xp_for_next = basis.xp_for_next

    # The suggested path from lifetime practice — always computed (a gentle lean shown before
    # commit). At/after the commit stage, crystallize it once into spirits.path (idempotent).
    lean = path_lean(db, user_id)
    _maybe_commit_path(db, spirit, level=level, lean=lean)

    cosmetics = _cosmetics(spirit)
    coins = max(0, level * COINS_PER_LEVEL - _cosmetics_spent(cosmetics))

    return SpiritState(
        stage=stage_for_level(level),
        path=spirit.path,
        path_lean=lean,
        bond=SpiritBond(
            level=level,
            xp_into_level=xp_into_level,
            xp_for_next=xp_for_next,
        ),
        daily_glow=daily_glow(db, user_id, today=today, tz=tz),
        coins=coins,
        cosmetics=cosmetics,
    )

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

from app.models.session import Session
from app.models.spirit import Spirit
from app.schemas.spirit import SpiritBond, SpiritState
from app.services import dashboard_service
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
    """The active spirit's computed state: stage, path (NULL in step 1), bond, daily glow,
    coins, and owned cosmetics. Get-or-creates the spark on first read."""
    spirit = get_or_create_active_spirit(db, user_id)

    basis = dashboard_service.get_wallet_basis(db, user_id, today=today, tz=tz)
    level = basis.level
    xp_into_level = basis.xp_into_level
    xp_for_next = basis.xp_for_next

    cosmetics = _cosmetics(spirit)
    coins = max(0, level * COINS_PER_LEVEL - _cosmetics_spent(cosmetics))

    return SpiritState(
        stage=stage_for_level(level),
        path=spirit.path,
        bond=SpiritBond(
            level=level,
            xp_into_level=xp_into_level,
            xp_for_next=xp_for_next,
        ),
        daily_glow=daily_glow(db, user_id, today=today, tz=tz),
        coins=coins,
        cosmetics=cosmetics,
    )

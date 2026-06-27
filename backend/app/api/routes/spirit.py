"""Spirit routes (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024, ADR-0027). The read API
plus the choose (creature + name), cosmetics unlock/equip, paid name reset, and awaken /
collection writes.

Thin handlers — all business logic lives in `spirit_service`; its domain errors map to HTTP
status codes here. Scoped to the authenticated user (default-deny via get_current_user); the
email-verification gate matches the other user-data routers. Writes carry the per-IP write
burst limit (`write_rate_limit`) like the other user-data mutations.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email, today_for_user
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.spirit import (
    ChoosePathRequest,
    CosmeticsRequest,
    EquipRequest,
    ResetNameRequest,
    SlotPreview,
    SpiritState,
    TendRequest,
)
from app.services import spirit_service
from app.services.spirit_service import (
    AlreadyOwned,
    CosmeticLocked,
    InsufficientCoins,
    NotOwned,
    NotRadiant,
    PathAlreadyChosen,
    PrerequisiteNotMet,
    SpiritConflictError,
    SpiritDead,
    UnknownCosmetic,
)

router = APIRouter(
    prefix="/spirit",
    tags=["spirit"],
    dependencies=[Depends(require_verified_email)],
)

_NOT_FOUND = not_found("Not found")
_BROKE = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not enough coins")
# A concurrent awaken collided on the one-active-spirit index — 409, not 500.
_CONFLICT = HTTPException(
    status_code=status.HTTP_409_CONFLICT, detail="The spirit was updated concurrently; retry"
)


@router.get("", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def get_spirit(
    request: Request,  # required by the rate limiter
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """The active spirit's computed state — stage, the chosen path (null until chosen), bond,
    the per-creature condition, coins, owned cosmetics + the catalog with per-option state,
    and the retired collection. The spark is lazily created on first read.

    Carries the per-IP write burst limit even though it's a GET: it writes-on-read (lazy
    get-or-create), so it isn't a pure read."""
    today, tz = today_tz
    return spirit_service.get_spirit(db, current_user.id, today=today, tz=tz)


@router.get("/preview", response_model=dict[str, list[SlotPreview]])
def preview_paths(
    current_user: User = Depends(get_current_user),
) -> dict[str, list[SlotPreview]]:
    """The read-only skill-tree PREVIEW for ALL three creatures at once (ADR-0027), so the
    choose page can show what each one grows into before the user picks. Keyed by path
    (`stillness` / `breath` / `heart`); each value is the path's slots with their options ordered
    by tier, including that path's own exclusive capstones and excluding other paths' exclusives.

    Static catalog data — no DB query and no spirit row needed. Auth-gated (verified email via the
    router dependency, plus the current-user dependency) like the rest of the spirit routes; not
    rate-limited since it's a pure, cacheable read."""
    return spirit_service.all_paths_preview()


@router.post("/choose", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def choose_path(
    request: Request,  # required by the rate limiter
    body: ChoosePathRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Choose the active creature + name it once (ADR-0023 / ADR-0024). Sets the path AND the
    required name only while the spirit is pathless; choosing again → 409. An unknown path or a
    missing/blank/over-length name is rejected as 422 by the schema."""
    today, tz = today_tz
    try:
        return spirit_service.choose_path(db, current_user.id, body, today=today, tz=tz)
    except PathAlreadyChosen:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your spirit has already chosen its path",
        ) from None


@router.post("/tend", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def tend_spirit(
    request: Request,  # required by the rate limiter
    body: TendRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """A manual TEND action (ADR-0029): Feed / Rest / Play. `kind` (`feed` | `rest` | `play`) tops
    up the matching need (nourished / rested / joyful) to TEND_CAP, enough to keep the spirit alive
    between sessions. An unknown kind is rejected as 422 by the schema. A DEAD spirit cannot be
    tended → 409 (awaken a new one). Returns the fresh spirit state, same shape as GET /spirit."""
    today, tz = today_tz
    try:
        return spirit_service.tend_spirit(db, current_user.id, body.kind, today=today, tz=tz)
    except SpiritDead:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your spirit has died — awaken a new one to care for it",
        ) from None


@router.post("/cosmetics", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def unlock_cosmetic(
    request: Request,  # required by the rate limiter
    body: CosmeticsRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Unlock a cosmetic (slot → option) into the active spirit's owned collection and auto-equip
    it (ADR-0027). The full cost is deducted from the coin balance and added to the spend ledger
    (owned forever, never refunded). Unknown / unavailable slot-option → 404; already owned,
    level-locked, tier-prereq unmet, or unaffordable → 409."""
    today, tz = today_tz
    try:
        return spirit_service.unlock_cosmetic(db, current_user.id, body, today=today, tz=tz)
    except UnknownCosmetic:
        raise _NOT_FOUND from None
    except AlreadyOwned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your spirit already owns that cosmetic",
        ) from None
    except CosmeticLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That cosmetic is not unlocked yet"
        ) from None
    except PrerequisiteNotMet:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unlock an earlier option in this slot first",
        ) from None
    except InsufficientCoins:
        raise _BROKE from None


@router.post("/cosmetics/equip", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def equip_cosmetic(
    request: Request,  # required by the rate limiter
    body: EquipRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Equip an OWNED cosmetic option into its slot, or clear the slot with a null `option`
    (ADR-0027) — FREE and instant; no coins, no pamper. Unknown slot, or an option that doesn't
    belong to the slot → 404; an option the spirit doesn't own → 409."""
    today, tz = today_tz
    try:
        return spirit_service.equip_cosmetic(db, current_user.id, body, today=today, tz=tz)
    except UnknownCosmetic:
        raise _NOT_FOUND from None
    except NotOwned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your spirit hasn't unlocked that cosmetic yet",
        ) from None


@router.post("/reset-name", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def reset_name(
    request: Request,  # required by the rate limiter
    body: ResetNameRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Change the active spirit's name via a PAID reset (ADR-0024). The name is otherwise
    immutable. Charges the flat reset fee — too few coins → 409. The new name is required and
    validated like creation (blank / over-length → 422 by the schema)."""
    today, tz = today_tz
    try:
        return spirit_service.reset_name(db, current_user.id, body, today=today, tz=tz)
    except InsufficientCoins:
        raise _BROKE from None


@router.post("/awaken", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def awaken_spirit(
    request: Request,  # required by the rate limiter
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Retire the active spirit and awaken a fresh pathless spark. Reachable when the spirit is
    radiant (step 6) OR when it has DIED (ADR-0029: the memorial's "awaken a new one"). When it is
    neither → 409; a concurrent awaken is also 409."""
    today, tz = today_tz
    try:
        return spirit_service.awaken(db, current_user.id, today=today, tz=tz)
    except NotRadiant:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your spirit is not radiant yet",
        ) from None
    except SpiritConflictError:
        raise _CONFLICT from None

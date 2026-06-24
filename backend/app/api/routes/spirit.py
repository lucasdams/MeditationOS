"""Spirit routes (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024). The read API plus the
choose (creature + name), cosmetics, paid name/upgrade resets, and awaken / collection writes.

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
    ResetNameRequest,
    SpiritState,
)
from app.services import spirit_service
from app.services.spirit_service import (
    CosmeticLocked,
    CosmeticSlotLocked,
    InsufficientCoins,
    NothingToReset,
    NotRadiant,
    PathAlreadyChosen,
    SpiritConflictError,
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


@router.post("/cosmetics", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def buy_cosmetic(
    request: Request,  # required by the rate limiter
    body: CosmeticsRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Buy/apply a cosmetic (slot → option) to the active spirit. The full cost is deducted
    from the derived coin balance and added to the spend ledger. A slot is applied once and
    then LOCKED (ADR-0024) — changing it needs a paid upgrades-reset. Unknown slot/option →
    404; locked-slot / not-unlocked / unaffordable → 409."""
    today, tz = today_tz
    try:
        return spirit_service.buy_cosmetic(db, current_user.id, body, today=today, tz=tz)
    except UnknownCosmetic:
        raise _NOT_FOUND from None
    except CosmeticSlotLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That slot is locked — reset upgrades to change it",
        ) from None
    except CosmeticLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That cosmetic is not unlocked yet"
        ) from None
    except InsufficientCoins:
        raise _BROKE from None


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


@router.post("/reset-upgrades", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def reset_upgrades(
    request: Request,  # required by the rate limiter
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Clear ALL applied upgrades via a PAID reset (ADR-0024), unlocking every slot. Charges
    the flat reset fee — too few coins → 409 — and does NOT refund the cleared upgrades. With
    no upgrades applied there's nothing to reset → 409."""
    today, tz = today_tz
    try:
        return spirit_service.reset_cosmetics(db, current_user.id, today=today, tz=tz)
    except NothingToReset:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There are no upgrades to reset",
        ) from None
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
    """Retire the active radiant spirit and awaken a fresh pathless spark (step 6). Requires
    the active spirit to be at radiant — otherwise 409; a concurrent awaken is also 409."""
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

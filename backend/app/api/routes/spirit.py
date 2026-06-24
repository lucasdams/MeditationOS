"""Spirit routes (docs/design/spirit.md, ADR-0022, ADR-0023). The read API plus the choose,
cosmetics, nickname, and awaken / collection writes.

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
    RenameRequest,
    SpiritState,
)
from app.services import spirit_service
from app.services.spirit_service import (
    AlreadyApplied,
    CosmeticLocked,
    InsufficientCoins,
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
    """Choose the active creature once (ADR-0023). Sets the path only while the spirit is
    pathless; choosing again → 409. An unknown path value is rejected as 422 by the schema."""
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
    """Buy/apply a cosmetic (slot → option) to the active spirit. The cost is deducted from
    the derived coin balance; a within-slot swap charges only the difference. Unknown
    slot/option → 404; locked / unaffordable / already-applied → 409."""
    today, tz = today_tz
    try:
        return spirit_service.buy_cosmetic(db, current_user.id, body, today=today, tz=tz)
    except UnknownCosmetic:
        raise _NOT_FOUND from None
    except CosmeticLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That cosmetic is not unlocked yet"
        ) from None
    except AlreadyApplied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That cosmetic is already applied"
        ) from None
    except InsufficientCoins:
        raise _BROKE from None


@router.patch("", response_model=SpiritState)
@limiter.limit(settings.write_rate_limit)
def rename_spirit(
    request: Request,  # required by the rate limiter
    body: RenameRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """Set or clear the active spirit's nickname (cosmetic; never changes coins). An empty/
    whitespace/null name clears it; over-length is rejected as 422 by the schema."""
    today, tz = today_tz
    return spirit_service.rename_spirit(db, current_user.id, body, today=today, tz=tz)


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

"""Sanctuary routes (a spend economy — see ADR-0011 / ADR-0012). Thin handlers; domain
errors from the service map to HTTP status codes here. All scoped to the authenticated
user (default-deny via get_current_user).
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email, today_for_user
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.sanctuary import (
    BuyRequest,
    CustomizeRequest,
    MoveRequest,
    PersonalizeRequest,
    SanctuaryScene,
)
from app.services import sanctuary_service
from app.services.sanctuary_service import (
    AlreadyApplied,
    CellOutOfBounds,
    InsufficientCoins,
    ItemLocked,
    SanctuaryConflictError,
    UnknownItem,
    UnknownSlotOption,
    UnknownVariant,
)

router = APIRouter(
    prefix="/sanctuary",
    tags=["sanctuary"],
    dependencies=[Depends(require_verified_email)],
)

_NOT_FOUND = not_found("Not found")
_BROKE = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not enough coins")
# A concurrent write to the same garden collided on a unique constraint — 409, not 500.
_CONFLICT = HTTPException(
    status_code=status.HTTP_409_CONFLICT, detail="The garden was updated concurrently; retry"
)


@router.get("", response_model=SanctuaryScene)
def get_sanctuary(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SanctuaryScene:
    today, tz = today_tz
    return sanctuary_service.get_scene(db, current_user.id, today=today, tz=tz)


@router.post("/buy", response_model=SanctuaryScene, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def buy_item(
    request: Request,  # required by the rate limiter
    body: BuyRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SanctuaryScene:
    today, tz = today_tz
    try:
        return sanctuary_service.buy(db, current_user.id, body, today=today, tz=tz)
    except (UnknownItem, UnknownVariant):
        raise _NOT_FOUND from None
    except ItemLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That item is not unlocked yet"
        ) from None
    except InsufficientCoins:
        raise _BROKE from None
    except SanctuaryConflictError:
        raise _CONFLICT from None


@router.post("/items/{planting_id}/customize", response_model=SanctuaryScene)
@limiter.limit(settings.write_rate_limit)
def customize_item(
    request: Request,  # required by the rate limiter
    planting_id: uuid.UUID,
    body: CustomizeRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SanctuaryScene:
    """Apply a customization (slot → option) to an owned item. Each customization costs
    coins (deducted from the derived balance)."""
    today, tz = today_tz
    try:
        scene = sanctuary_service.customize(
            db, current_user.id, planting_id, body, today=today, tz=tz
        )
    except UnknownSlotOption:
        raise _NOT_FOUND from None
    except ItemLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That option is not unlocked yet"
        ) from None
    except AlreadyApplied:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That option is already applied"
        ) from None
    except InsufficientCoins:
        raise _BROKE from None
    except SanctuaryConflictError:
        raise _CONFLICT from None
    if scene is None:
        raise _NOT_FOUND
    return scene


@router.patch("/items/{planting_id}", response_model=SanctuaryScene)
@limiter.limit(settings.write_rate_limit)
def personalize_item(
    request: Request,  # required by the rate limiter
    planting_id: uuid.UUID,
    body: PersonalizeRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SanctuaryScene:
    """Set or clear an owned item's cosmetic personalization — name (plaque), note, and
    favourite flag (ADR-0015). Partial update: only fields present in the body change; an
    empty/whitespace/null name or note clears it. Purely cosmetic — never changes coins.
    Over-length name/note is rejected as 422 by the schema; another user's item is 404.
    """
    today, tz = today_tz
    try:
        scene = sanctuary_service.personalize(
            db, current_user.id, planting_id, body, today=today, tz=tz
        )
    except SanctuaryConflictError:
        raise _CONFLICT from None
    if scene is None:
        raise _NOT_FOUND
    return scene


@router.post("/items/{planting_id}/move", response_model=SanctuaryScene)
@limiter.limit(settings.write_rate_limit)
def move_item(
    request: Request,  # required by the rate limiter
    planting_id: uuid.UUID,
    body: MoveRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SanctuaryScene:
    """Move an owned item to a grid cell (layout only — never touches pricing). Swaps with
    whatever item already sits there. Out-of-bounds cells are rejected as 422."""
    today, tz = today_tz
    try:
        scene = sanctuary_service.move(
            db, current_user.id, planting_id, body, today=today, tz=tz
        )
    except CellOutOfBounds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That cell is outside the garden grid",
        ) from None
    except SanctuaryConflictError:
        raise _CONFLICT from None
    if scene is None:
        raise _NOT_FOUND
    return scene

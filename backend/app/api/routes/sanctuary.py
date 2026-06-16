"""Sanctuary routes (a spend economy — see ADR-0011 / ADR-0012). Thin handlers; domain
errors from the service map to HTTP status codes here. All scoped to the authenticated
user (default-deny via get_current_user).
"""

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email
from app.core.db import get_db
from app.models.user import User
from app.schemas.sanctuary import (
    BuyRequest,
    CustomizeRequest,
    MoveRequest,
    SanctuaryScene,
)
from app.services import sanctuary_service
from app.services.sanctuary_service import (
    AlreadyApplied,
    CellOutOfBounds,
    InsufficientCoins,
    ItemLocked,
    UnknownItem,
    UnknownSlotOption,
    UnknownVariant,
)

router = APIRouter(
    prefix="/sanctuary",
    tags=["sanctuary"],
    dependencies=[Depends(require_verified_email)],
)

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
_BROKE = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not enough coins")


def _today_for(user: User) -> tuple[date, str]:
    """The user's current local date + timezone (falls back to UTC) — for the streak."""
    tz = user.timezone or "UTC"
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        tz, zone = "UTC", ZoneInfo("UTC")
    return datetime.now(zone).date(), tz


@router.get("", response_model=SanctuaryScene)
def get_sanctuary(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    today, tz = _today_for(current_user)
    return sanctuary_service.get_scene(db, current_user.id, today=today, tz=tz)


@router.post("/buy", response_model=SanctuaryScene, status_code=status.HTTP_201_CREATED)
def buy_item(
    body: BuyRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    today, tz = _today_for(current_user)
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


@router.post("/items/{planting_id}/customize", response_model=SanctuaryScene)
def customize_item(
    planting_id: uuid.UUID,
    body: CustomizeRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    """Apply a customization (slot → option) to an owned item. Each customization costs
    coins (deducted from the derived balance)."""
    today, tz = _today_for(current_user)
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
    if scene is None:
        raise _NOT_FOUND
    return scene


@router.post("/items/{planting_id}/move", response_model=SanctuaryScene)
def move_item(
    planting_id: uuid.UUID,
    body: MoveRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    """Move an owned item to a grid cell (layout only — never touches pricing). Swaps with
    whatever item already sits there. Out-of-bounds cells are rejected as 422."""
    today, tz = _today_for(current_user)
    try:
        scene = sanctuary_service.move(
            db, current_user.id, planting_id, body, today=today, tz=tz
        )
    except CellOutOfBounds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That cell is outside the garden grid",
        ) from None
    if scene is None:
        raise _NOT_FOUND
    return scene

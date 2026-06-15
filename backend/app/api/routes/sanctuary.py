"""Sanctuary routes (a spend economy — see ADR-0011). Thin handlers; domain errors from
the service map to HTTP status codes here. All scoped to the authenticated user.
"""

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.sanctuary import BuyRequest, SanctuaryScene
from app.services import sanctuary_service
from app.services.sanctuary_service import (
    InsufficientCoins,
    ItemLocked,
    MaxTier,
    UnknownItem,
)

router = APIRouter(prefix="/sanctuary", tags=["sanctuary"])

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
    except UnknownItem:
        raise _NOT_FOUND from None
    except ItemLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That item is not unlocked yet"
        ) from None
    except InsufficientCoins:
        raise _BROKE from None


@router.post("/items/{planting_id}/upgrade", response_model=SanctuaryScene)
def upgrade_item(
    planting_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    today, tz = _today_for(current_user)
    try:
        scene = sanctuary_service.upgrade(db, current_user.id, planting_id, today=today, tz=tz)
    except MaxTier:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Already at the highest tier"
        ) from None
    except InsufficientCoins:
        raise _BROKE from None
    if scene is None:
        raise _NOT_FOUND
    return scene

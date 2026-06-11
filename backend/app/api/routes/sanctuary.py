"""Sanctuary routes. Thin handlers — delegate to the service, scoped to the user.
Domain errors from the service are mapped to HTTP status codes here.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.sanctuary import PlantRequest, SanctuaryScene
from app.services import sanctuary_service
from app.services.sanctuary_service import CurrentStillGrowing, ItemLocked, UnknownItem

router = APIRouter(prefix="/sanctuary", tags=["sanctuary"])


@router.get("", response_model=SanctuaryScene)
def get_sanctuary(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    return sanctuary_service.get_scene(db, current_user.id)


@router.post("/plantings", response_model=SanctuaryScene, status_code=status.HTTP_201_CREATED)
def plant_next(
    body: PlantRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    try:
        return sanctuary_service.plant_next(db, current_user.id, body.item_key)
    except UnknownItem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown item"
        ) from None
    except CurrentStillGrowing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The current planting is still growing",
        ) from None
    except ItemLocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That item is not unlocked yet"
        ) from None

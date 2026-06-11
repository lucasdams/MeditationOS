"""Sanctuary routes. Thin handler — delegates to the service, scoped to the user."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.sanctuary import SanctuaryScene
from app.services import sanctuary_service

router = APIRouter(prefix="/sanctuary", tags=["sanctuary"])


@router.get("", response_model=SanctuaryScene)
def get_sanctuary(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SanctuaryScene:
    return sanctuary_service.get_scene(db, current_user.id)

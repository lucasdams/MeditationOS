"""Breathing pattern routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email
from app.core.db import get_db
from app.models.user import User
from app.schemas.breathing_pattern import BreathingPatternCreate, BreathingPatternRead
from app.services import breathing_pattern_service

router = APIRouter(
    prefix="/breathing-patterns",
    tags=["breathing-patterns"],
    dependencies=[Depends(require_verified_email)],
)


@router.get("", response_model=list[BreathingPatternRead])
def list_patterns(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BreathingPatternRead]:
    return breathing_pattern_service.list_patterns(db, current_user.id)


@router.post("", response_model=BreathingPatternRead, status_code=status.HTTP_201_CREATED)
def create_pattern(
    data: BreathingPatternCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BreathingPatternRead:
    return breathing_pattern_service.create_pattern(db, current_user.id, data)


@router.delete("/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pattern(
    pattern_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not breathing_pattern_service.delete_pattern(db, current_user.id, pattern_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pattern not found"
        )

"""Mood check-in routes. Thin handlers — logic in the service, scoped to the user."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.mood_log import MoodLogCreate, MoodLogRead
from app.services import mood_log_service

router = APIRouter(
    prefix="/mood-logs",
    tags=["mood-logs"],
    dependencies=[Depends(require_verified_email)],
)


@router.post("", response_model=MoodLogRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_log(
    request: Request,  # required by the rate limiter
    data: MoodLogCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MoodLogRead:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    return mood_log_service.create_log(db, current_user.id, data)


@router.get("", response_model=list[MoodLogRead])
def list_logs(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int | None = Query(default=None, ge=1, le=366),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[MoodLogRead]:
    return mood_log_service.list_logs(
        db, current_user.id, days=days, limit=limit, offset=offset
    )


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    log_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not mood_log_service.delete_log(db, current_user.id, log_id):
        raise not_found()

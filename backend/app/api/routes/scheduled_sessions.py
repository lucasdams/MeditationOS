"""Scheduled-session routes — plan future practice + an 'add to calendar' (.ics) export.
Thin handlers; logic in the service; everything scoped to the authenticated user."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import DailyLimitError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.scheduled_session import ScheduledSessionCreate, ScheduledSessionRead
from app.services import scheduled_session_service

router = APIRouter(prefix="/scheduled-sessions", tags=["scheduled-sessions"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
_DAILY_LIMIT = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail="Daily limit reached. Please try again tomorrow.",
)


@router.post("", response_model=ScheduledSessionRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_scheduled(
    request: Request,  # required by the rate limiter
    data: ScheduledSessionCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScheduledSessionRead:
    try:
        return scheduled_session_service.create(db, current_user.id, data)
    except DailyLimitError:
        raise _DAILY_LIMIT from None


@router.get("", response_model=list[ScheduledSessionRead])
def list_scheduled(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    upcoming: bool = Query(default=True),
) -> list[ScheduledSessionRead]:
    return scheduled_session_service.list_for_user(
        db, current_user.id, upcoming_only=upcoming
    )


@router.get("/{sched_id}/ics")
def export_ics(
    sched_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    row = scheduled_session_service.get(db, current_user.id, sched_id)
    if row is None:
        raise _NOT_FOUND
    return Response(
        content=scheduled_session_service.to_ics(row),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="meditation.ics"'},
    )


@router.delete("/{sched_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scheduled(
    sched_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not scheduled_session_service.delete(db, current_user.id, sched_id):
        raise _NOT_FOUND

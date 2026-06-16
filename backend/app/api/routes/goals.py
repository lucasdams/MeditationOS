"""Goal routes. Thin handlers — validate, delegate to the service, always scoped
to the authenticated user. Progress is computed on read (see goal_service).
"""

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import GoalNotCheckableError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate
from app.services import goal_service

router = APIRouter(prefix="/goals", tags=["goals"], dependencies=[Depends(require_verified_email)])

_NOT_FOUND = not_found("Goal not found")
_NOT_CUSTOM = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="Only custom goals can be checked in.",
)


def _today_for(user: User) -> tuple[date, str]:
    """The user's current local date + their timezone (falls back to UTC)."""
    tz = user.timezone or "UTC"
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        tz, zone = "UTC", ZoneInfo("UTC")
    return datetime.now(zone).date(), tz


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_goal(
    request: Request,  # required by the rate limiter
    data: GoalCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalRead:
    today, tz = _today_for(current_user)
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    return goal_service.create_goal(db, current_user.id, data, today=today, tz=tz)


@router.get("", response_model=list[GoalRead])
def list_goals(
    status: str | None = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GoalRead]:
    today, tz = _today_for(current_user)
    return goal_service.list_goals(db, current_user.id, today=today, tz=tz, status=status)


# Unowned (or missing) IDs return 404 — never 403 — to avoid leaking which IDs exist.
@router.get("/{goal_id}", response_model=GoalRead)
def get_goal(
    goal_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalRead:
    today, tz = _today_for(current_user)
    goal = goal_service.get_goal(db, current_user.id, goal_id, today=today, tz=tz)
    if goal is None:
        raise _NOT_FOUND
    return goal


@router.patch("/{goal_id}", response_model=GoalRead)
def update_goal(
    goal_id: uuid.UUID,
    data: GoalUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalRead:
    today, tz = _today_for(current_user)
    goal = goal_service.update_goal(db, current_user.id, goal_id, data, today=today, tz=tz)
    if goal is None:
        raise _NOT_FOUND
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not goal_service.delete_goal(db, current_user.id, goal_id):
        raise _NOT_FOUND


# --- Custom-habit check-ins (manual "done today" for `custom` goals only) ---


@router.post("/{goal_id}/checkins", response_model=GoalRead)
@limiter.limit(settings.write_rate_limit)
def check_in(
    request: Request,  # required by the rate limiter
    goal_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalRead:
    today, tz = _today_for(current_user)
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    try:
        goal = goal_service.add_checkin(db, current_user.id, goal_id, today=today, tz=tz)
    except GoalNotCheckableError:
        raise _NOT_CUSTOM from None
    if goal is None:
        raise _NOT_FOUND
    return goal


@router.delete("/{goal_id}/checkins/today", response_model=GoalRead)
@limiter.limit(settings.write_rate_limit)
def undo_check_in(
    request: Request,  # required by the rate limiter
    goal_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalRead:
    today, tz = _today_for(current_user)
    try:
        goal = goal_service.remove_checkin(db, current_user.id, goal_id, today=today, tz=tz)
    except GoalNotCheckableError:
        raise _NOT_CUSTOM from None
    if goal is None:
        raise _NOT_FOUND
    return goal

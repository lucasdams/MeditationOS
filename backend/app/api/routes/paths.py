"""Path routes. Thin handlers — derivation + enrollment live in `path_service`.

A Path's per-day progress is computed from the user's logged activity at read time (never
stored), so there is no path data to mutate here beyond the small enrollment row.
"""

from datetime import date

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email, today_for_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.path import PathList, PathSummary
from app.services import path_service

router = APIRouter(
    prefix="/paths",
    tags=["paths"],
    dependencies=[Depends(require_verified_email)],
)


@router.get("", response_model=PathList)
def list_paths(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> PathList:
    _today, tz = today_tz
    return PathList(paths=path_service.list_paths(db, current_user.id, tz=tz))


@router.post(
    "/{path_id}/enroll",
    response_model=PathSummary,
    status_code=status.HTTP_201_CREATED,
)
def enroll(
    path_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> PathSummary:
    today, tz = today_tz
    try:
        return path_service.enroll(db, current_user.id, path_id, today=today, tz=tz)
    except KeyError:
        raise not_found("Unknown path")

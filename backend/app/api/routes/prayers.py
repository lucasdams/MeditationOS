"""Prayer journal routes. Thin handlers — validate, delegate to the service,
always scoped to the authenticated user. Mirrors app/api/routes/journals.py.
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.prayer import PrayerCreate, PrayerRead, PrayerUpdate
from app.services import prayer_service

router = APIRouter(
    prefix="/prayers",
    tags=["prayers"],
    dependencies=[Depends(require_verified_email)],
)

_NOT_FOUND = not_found("Prayer not found")


@router.post("", response_model=PrayerRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_prayer(
    request: Request,  # required by the rate limiter
    data: PrayerCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PrayerRead:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    return prayer_service.create_entry(db, current_user.id, data)


@router.get("", response_model=list[PrayerRead])
def list_prayers(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    answered: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[PrayerRead]:
    return prayer_service.list_entries(
        db, current_user.id, answered=answered, limit=limit, offset=offset
    )


# Unowned (or missing) IDs return 404 — never 403 — to avoid leaking which IDs exist.
@router.get("/{prayer_id}", response_model=PrayerRead)
def get_prayer(
    prayer_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PrayerRead:
    entry = prayer_service.get_entry(db, current_user.id, prayer_id)
    if entry is None:
        raise _NOT_FOUND
    return entry


@router.patch("/{prayer_id}", response_model=PrayerRead)
def update_prayer(
    prayer_id: uuid.UUID,
    data: PrayerUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PrayerRead:
    entry = prayer_service.update_entry(db, current_user.id, prayer_id, data)
    if entry is None:
        raise _NOT_FOUND
    return entry


@router.delete("/{prayer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prayer(
    prayer_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not prayer_service.delete_entry(db, current_user.id, prayer_id):
        raise _NOT_FOUND

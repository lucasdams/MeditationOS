"""Biometric reading routes. Thin handlers — logic in the service, scoped to the
user. Readings are a personal wellness signal, not a medical measurement."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import DailyLimitError, LinkedSessionNotFoundError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.biometric_reading import (
    BiometricDelta,
    BiometricReadingCreate,
    BiometricReadingRead,
)
from app.services import biometric_reading_service

router = APIRouter(
    prefix="/biometric-readings",
    tags=["biometric-readings"],
    dependencies=[Depends(require_verified_email)],
)

_DAILY_LIMIT = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail="Daily limit reached. Please try again tomorrow.",
)


@router.post("", response_model=BiometricReadingRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_reading(
    request: Request,  # required by the rate limiter
    data: BiometricReadingCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BiometricReadingRead:
    try:
        return biometric_reading_service.create_reading(db, current_user.id, data)
    except DailyLimitError:
        raise _DAILY_LIMIT from None
    except LinkedSessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Linked session not found"
        ) from None


@router.get("", response_model=list[BiometricReadingRead])
def list_readings(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int | None = Query(default=None, ge=1, le=366),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[BiometricReadingRead]:
    return biometric_reading_service.list_readings(
        db, current_user.id, days=days, limit=limit, offset=offset
    )


@router.get("/delta", response_model=BiometricDelta)
def pre_post_delta(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int | None = Query(default=None, ge=1, le=366),
) -> BiometricDelta:
    """Average pre→post change around sits — the immediate calming signal."""
    return biometric_reading_service.pre_post_delta(db, current_user.id, days=days)


@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(
    reading_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not biometric_reading_service.delete_reading(db, current_user.id, reading_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

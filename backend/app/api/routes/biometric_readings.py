"""Biometric reading routes. Thin handlers — logic in the service, scoped to the
user. Readings are a personal wellness signal, not a medical measurement."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import LinkedSessionNotFoundError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.biometric_reading import (
    BiometricDelta,
    BiometricReadingCreate,
    BiometricReadingLink,
    BiometricReadingRead,
)
from app.services import biometric_reading_service

router = APIRouter(
    prefix="/biometric-readings",
    tags=["biometric-readings"],
    dependencies=[Depends(require_verified_email)],
)


@router.post("", response_model=BiometricReadingRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_reading(
    request: Request,  # required by the rate limiter
    data: BiometricReadingCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BiometricReadingRead:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    try:
        return biometric_reading_service.create_reading(db, current_user.id, data)
    except LinkedSessionNotFoundError:
        raise not_found("Linked session not found") from None


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


@router.patch("/{reading_id}/session", response_model=BiometricReadingRead)
def link_reading_session(
    reading_id: uuid.UUID,
    data: BiometricReadingLink,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BiometricReadingRead:
    """Attach a saved reading to a sit (backfilling a pre-session reading's
    `session_id` once the sit has been created)."""
    try:
        reading = biometric_reading_service.link_reading_session(
            db, current_user.id, reading_id, data.session_id
        )
    except LinkedSessionNotFoundError:
        raise not_found("Linked session not found") from None
    if reading is None:
        raise not_found()
    return reading


@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(
    reading_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not biometric_reading_service.delete_reading(db, current_user.id, reading_id):
        raise not_found()

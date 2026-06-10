"""Gratitude routes. Thin handlers — CRUD in the service, suggestions in the AI layer."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.gratitude import (
    GratitudeCategory,
    GratitudeCreate,
    GratitudeRead,
    GratitudeSuggestions,
)
from app.services import gratitude_service
from app.services.ai import gratitude_suggester

router = APIRouter(prefix="/gratitude", tags=["gratitude"])


@router.post("", response_model=GratitudeRead, status_code=status.HTTP_201_CREATED)
def create_entry(
    data: GratitudeCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GratitudeRead:
    return gratitude_service.create_entry(db, current_user.id, data)


@router.get("", response_model=list[GratitudeRead])
def list_entries(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[GratitudeRead]:
    return gratitude_service.list_entries(
        db, current_user.id, category=category, limit=limit, offset=offset
    )


@router.get("/suggestions", response_model=GratitudeSuggestions)
@limiter.limit("30/minute")
def suggestions(
    request: Request,  # required by the rate limiter
    category: GratitudeCategory,
    current_user: User = Depends(get_current_user),
) -> GratitudeSuggestions:
    options = gratitude_suggester.suggest_options(category)
    return GratitudeSuggestions(category=category, options=options)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not gratitude_service.delete_entry(db, current_user.id, entry_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

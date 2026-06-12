"""Meditation journal routes. Thin handlers — validate, delegate to the service,
always scoped to the authenticated user.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.exceptions import LinkedSessionNotFoundError
from app.models.user import User
from app.schemas.journal import JournalCreate, JournalRead, JournalUpdate
from app.services import journal_service

router = APIRouter(prefix="/journals", tags=["journals"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")


@router.post("", response_model=JournalRead, status_code=status.HTTP_201_CREATED)
def create_journal(
    data: JournalCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JournalRead:
    try:
        return journal_service.create_entry(db, current_user.id, data)
    except LinkedSessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Linked session not found"
        ) from None


@router.get("", response_model=list[JournalRead])
def list_journals(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    mood: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[JournalRead]:
    return journal_service.list_entries(
        db, current_user.id, mood=mood, limit=limit, offset=offset
    )


# Unowned (or missing) IDs return 404 — never 403 — to avoid leaking which IDs exist.
@router.get("/{journal_id}", response_model=JournalRead)
def get_journal(
    journal_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JournalRead:
    entry = journal_service.get_entry(db, current_user.id, journal_id)
    if entry is None:
        raise _NOT_FOUND
    return entry


@router.patch("/{journal_id}", response_model=JournalRead)
def update_journal(
    journal_id: uuid.UUID,
    data: JournalUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JournalRead:
    entry = journal_service.update_entry(db, current_user.id, journal_id, data)
    if entry is None:
        raise _NOT_FOUND
    return entry


@router.delete("/{journal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal(
    journal_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not journal_service.delete_entry(db, current_user.id, journal_id):
        raise _NOT_FOUND

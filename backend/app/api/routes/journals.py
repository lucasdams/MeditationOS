"""Meditation journal routes. Thin handlers — validate, delegate to the service,
always scoped to the authenticated user.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import (
    get_current_user,
    require_verified_email,
    today_for_user,
)
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import LinkedSessionNotFoundError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.journal import (
    JournalCreate,
    JournalPromptRead,
    JournalRead,
    JournalUpdate,
)
from app.services import journal_prompt_service, journal_service

router = APIRouter(
    prefix="/journals",
    tags=["journals"],
    dependencies=[Depends(require_verified_email)],
)

_NOT_FOUND = not_found("Journal not found")


@router.post("", response_model=JournalRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_journal(
    request: Request,  # required by the rate limiter
    data: JournalCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JournalRead:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    try:
        return journal_service.create_entry(db, current_user.id, data)
    except LinkedSessionNotFoundError:
        raise not_found("Linked session not found") from None


@router.get("", response_model=list[JournalRead])
def list_journals(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    mood: str | None = None,
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[JournalRead]:
    return journal_service.list_entries(
        db, current_user.id, mood=mood, q=q, limit=limit, offset=offset
    )


# Declared before /{journal_id} so "random" isn't parsed as a UUID path param.
@router.get("/random", response_model=JournalRead)
def random_journal(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JournalRead:
    """A random past reflection — powers the "resurface a memory" feature."""
    entry = journal_service.random_entry(db, current_user.id)
    if entry is None:
        raise _NOT_FOUND
    return entry


# Declared before /{journal_id} so "prompt" isn't parsed as a UUID path param.
@router.get("/prompt", response_model=JournalPromptRead)
def journal_prompt(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> JournalPromptRead:
    """Today's journaling nudge, tuned to the user's recent practice (with a
    generic fallback). Read-only; no data is stored."""
    today, tz = today_tz
    return journal_prompt_service.get_prompt(db, current_user.id, today=today, tz=tz)


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

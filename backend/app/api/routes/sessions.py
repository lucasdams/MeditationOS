"""Meditation session routes. Thin handlers — validate, delegate to the service,
always scoped to the authenticated user.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.exceptions import DailyLimitError
from app.models.user import User
from app.schemas.session import SessionCreate, SessionRead, SessionUpdate
from app.services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
_DAILY_LIMIT = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail="Daily limit reached. Please try again tomorrow.",
)


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    data: SessionCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionRead:
    try:
        return session_service.create_session(db, current_user.id, data)
    except DailyLimitError:
        raise _DAILY_LIMIT from None


@router.get("", response_model=list[SessionRead])
def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SessionRead]:
    return session_service.list_sessions(
        db,
        current_user.id,
        date_from=date_from,
        date_to=date_to,
        type=type,
        limit=limit,
        offset=offset,
    )


# Unowned (or missing) IDs return 404 — never 403 — to avoid leaking which IDs exist.
@router.get("/{session_id}", response_model=SessionRead)
def get_session(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionRead:
    session = session_service.get_session(db, current_user.id, session_id)
    if session is None:
        raise _NOT_FOUND
    return session


@router.patch("/{session_id}", response_model=SessionRead)
def update_session(
    session_id: uuid.UUID,
    data: SessionUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionRead:
    session = session_service.update_session(db, current_user.id, session_id, data)
    if session is None:
        raise _NOT_FOUND
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not session_service.delete_session(db, current_user.id, session_id):
        raise _NOT_FOUND

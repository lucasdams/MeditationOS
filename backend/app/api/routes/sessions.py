"""Meditation session routes. Thin handlers — validate, delegate to the service,
always scoped to the authenticated user.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import DailyLimitError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.session import SessionCreate, SessionRead, SessionUpdate
from app.services import session_service

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
    dependencies=[Depends(require_verified_email)],
)

_NOT_FOUND = not_found("Session not found")


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_session(
    request: Request,  # required by the rate limiter
    data: SessionCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionRead:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    return session_service.create_session(db, current_user.id, data)


@router.post("/beacon", status_code=status.HTTP_204_NO_CONTENT)
async def save_session_beacon(
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Best-effort save used by `navigator.sendBeacon` when a tab closes mid-session.

    Beacons send a CORS-safelisted `text/plain` body (no JSON content-type / preflight),
    so we parse the raw body ourselves. Idempotent via `client_token`, so it never
    duplicates a session the user also saved manually. Malformed/duplicate beacons and
    rate/daily caps are swallowed — this is fire-and-forget; the localStorage draft is
    the reliable fallback.
    """
    # CSRF guard: beacons use text/plain (a CORS-safelisted content-type), so
    # the browser sends no preflight — a cross-site page could forge a write.
    # Reject any Origin that is present but not in the allowlist.  A missing
    # Origin is allowed (same-origin requests from some browsers omit it).
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins_list:
        return Response(status_code=status.HTTP_403_FORBIDDEN)

    raw = await request.body()
    try:
        data = SessionCreate.model_validate_json(raw)
    except ValidationError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        session_service.create_session(db, current_user.id, data)
    except DailyLimitError:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        tz=current_user.timezone or "UTC",
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

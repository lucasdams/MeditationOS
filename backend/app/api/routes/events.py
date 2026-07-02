"""Product-analytics ingest route. Thin handler — validation in the schema, persistence
in the service.

AUTH-OPTIONAL: this endpoint accepts events from logged-out and guest clients too, so it
uses `get_current_user_optional` (never 401s). When a valid session cookie is present the
event is attributed to that user; otherwise `user_id` is stored NULL.

The request body is NEVER logged (it's low-value and we keep this table PII-free by design).
"""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user_optional
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.analytics_event import EventCreate
from app.services import analytics_event_service

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.write_rate_limit)
def create_event(
    request: Request,  # required by the rate limiter
    data: EventCreate,
    db: DBSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> Response:
    """Record one anonymous usage event. Returns 202 (accepted) on store, or 204 when the
    ANALYTICS_ENABLED kill switch is off (nothing is stored). Unknown event names and
    oversized/nested props are rejected as 422 by the schema before we get here."""
    user_id = current_user.id if current_user else None
    stored = analytics_event_service.record_event(db, data, user_id)
    if stored is None:
        # Kill switch off — acknowledge without storing.
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return Response(status_code=status.HTTP_202_ACCEPTED)

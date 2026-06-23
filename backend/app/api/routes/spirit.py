"""Spirit routes (docs/design/spirit.md, ADR-0022). Step 1: the read API only.

Thin handler — all business logic lives in `spirit_service`. Scoped to the authenticated
user (default-deny via get_current_user); the email-verification gate matches the other
user-data routers.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email, today_for_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.spirit import SpiritState
from app.services import spirit_service

router = APIRouter(
    prefix="/spirit",
    tags=["spirit"],
    dependencies=[Depends(require_verified_email)],
)


@router.get("", response_model=SpiritState)
def get_spirit(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> SpiritState:
    """The active spirit's computed state — stage, path (null until it commits), bond,
    daily glow, coins, and owned cosmetics. The spark is lazily created on first read."""
    today, tz = today_tz
    return spirit_service.get_spirit(db, current_user.id, today=today, tz=tz)

"""In-app feedback route. A thin handler — logic in the service. Auth required (it's an
in-app action), scoped to the sender on write; per-IP write rate-limit + per-user daily
cap resist spam. The message body is never logged."""

import logging

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.feedback import FeedbackCreate, FeedbackRead
from app.services import feedback_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/feedback",
    tags=["feedback"],
    dependencies=[Depends(require_verified_email)],
)


@router.post("", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.write_rate_limit)
def create_feedback(
    request: Request,  # required by the rate limiter
    data: FeedbackCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeedbackRead:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py). Log only non-sensitive
    # metadata (category + length + path) — never the message body.
    logger.info(
        "Feedback submitted",
        extra={
            "category": data.category,
            "message_length": len(data.message),
            "path": data.path,
        },
    )
    return feedback_service.create_feedback(db, current_user.id, data)

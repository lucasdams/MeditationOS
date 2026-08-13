"""Philosopher-chat routes. Thin handlers — persona roster and the reflective reply
both live in `philosopher_service`; the LLM call is in the shared AI seam.

Auth is required (router-level `require_verified_email`, like other data routes). The
chat is stateless — nothing is persisted — and message content is never logged.
"""

from fastapi import APIRouter, Depends, Request

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.exceptions import PhilosopherNotFoundError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.philosopher import (
    PhilosopherChatRequest,
    PhilosopherChatResponse,
    PhilosopherSummary,
)
from app.services import philosopher_service

router = APIRouter(
    prefix="/philosophers",
    tags=["philosophers"],
    dependencies=[Depends(require_verified_email)],
)


@router.get("", response_model=list[PhilosopherSummary])
def list_philosophers(
    current_user: User = Depends(get_current_user),
) -> list[PhilosopherSummary]:
    """The picker roster. Auth-required for consistency with the other data routes."""
    return philosopher_service.list_personas()


@router.post("/{philosopher_id}/chat", response_model=PhilosopherChatResponse)
@limiter.limit(settings.write_rate_limit)
def chat(
    request: Request,  # required by the rate limiter
    philosopher_id: str,
    data: PhilosopherChatRequest,
    current_user: User = Depends(get_current_user),
) -> PhilosopherChatResponse:
    """Continue a reflective conversation with the chosen persona. The client sends the
    full (bounded) history each turn; nothing is stored server-side.

    GuestNotAllowedError → 403 and DailyLimitError → 429 are mapped app-wide (see
    app/main.py); an unknown persona is a 404 here.
    """
    try:
        return philosopher_service.reply(current_user, philosopher_id, data.messages)
    except PhilosopherNotFoundError:
        raise not_found("Philosopher not found") from None

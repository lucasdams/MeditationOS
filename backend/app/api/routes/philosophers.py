"""Philosopher-chat routes. Thin handlers — the persona roster, the reflective reply, and
the saved-conversation CRUD all live in `philosopher_service`; the LLM call is in the shared
AI seam.

Auth is required (router-level `require_verified_email`, like other data routes). The chat
reply is generated from the client-held history AND persisted to a saved conversation so it
can be reopened later; message content is never logged. Saved conversations are always scoped
to the authenticated user (404 — not 403 — for another user's id, to avoid id enumeration).
"""

import uuid

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import PhilosopherChatNotFoundError, PhilosopherNotFoundError
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.philosopher import (
    PhilosopherChatDetail,
    PhilosopherChatRequest,
    PhilosopherChatResponse,
    PhilosopherChatSummary,
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


# ── Saved conversations ─────────────────────────────────────────────────────────
# Declared BEFORE the `/{philosopher_id}/chat` generation route; the literal "conversations"
# segment is unambiguous against the persona-id param.


@router.get("/conversations", response_model=list[PhilosopherChatSummary])
def list_conversations(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhilosopherChatSummary]:
    """The caller's saved conversations, newest-touched first (no message content)."""
    return philosopher_service.list_chats(db, current_user)


@router.get("/conversations/{chat_id}", response_model=PhilosopherChatDetail)
def get_conversation(
    chat_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhilosopherChatDetail:
    """A saved conversation's full turns, for reopening it. 404 if it isn't the caller's."""
    try:
        return philosopher_service.get_chat(db, current_user, chat_id)
    except PhilosopherChatNotFoundError:
        raise not_found("Conversation not found") from None


@router.delete("/conversations/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    chat_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Delete a saved conversation. 404 if it isn't the caller's."""
    try:
        philosopher_service.delete_chat(db, current_user, chat_id)
    except PhilosopherChatNotFoundError:
        raise not_found("Conversation not found") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{philosopher_id}/chat", response_model=PhilosopherChatResponse)
@limiter.limit(settings.write_rate_limit)
def chat(
    request: Request,  # required by the rate limiter
    philosopher_id: str,
    data: PhilosopherChatRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhilosopherChatResponse:
    """Continue a reflective conversation with the chosen persona and persist the exchange.

    The client sends the full (bounded) history each turn; the reply is appended to the saved
    conversation named by `data.chat_id` (created when absent) and its id returned.

    DailyLimitError → 429 (guests get a smaller trial cap) is mapped app-wide (see app/main.py);
    an unknown persona, or a chat_id the caller doesn't own, is a 404 here.
    """
    try:
        return philosopher_service.reply(
            db, current_user, philosopher_id, data.messages, data.chat_id
        )
    except PhilosopherNotFoundError:
        raise not_found("Philosopher not found") from None
    except PhilosopherChatNotFoundError:
        raise not_found("Conversation not found") from None

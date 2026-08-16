"""Business logic for the "chat with a philosopher" feature.

The client holds the live conversation and sends the (bounded) history each turn; this
service picks the persona, enforces the safety/cost guards, calls the shared provider-
agnostic LLM seam (`llm_client.chat`) — degrading to a gentle in-character fallback line,
never raising on an LLM failure — and PERSISTS the exchange to a saved conversation
(`philosopher_chats`) so it can be reopened later. It raises the domain errors (404 unknown
persona / unowned chat, 403 guest, 429 daily cap) so the route maps them to HTTP.

Cost/abuse guards:
- Guests are blocked (each guest account is minted freely, and every message is a paid
  LLM call — an unguarded guest is a cost loop). Mirrors the reflection coach.
- History is truncated to the last few turns before the model call (input-token cap).
- A per-user daily message cap (429). See `_enforce_daily_message_cap`.

Logging is metadata only — persona id, model, prompt version, ok/fallback. The
conversation content is never logged (.claude/rules/ai-product.md).
"""

import logging
import threading
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import (
    DailyLimitError,
    GuestNotAllowedError,
    PhilosopherChatNotFoundError,
    PhilosopherNotFoundError,
)
from app.models.philosopher_chat import PhilosopherChat
from app.models.user import User
from app.prompts import philosophers
from app.schemas.philosopher import (
    ChatTurn,
    PhilosopherChatDetail,
    PhilosopherChatResponse,
    PhilosopherChatSummary,
    PhilosopherSummary,
)
from app.services.ai import llm_client
from app.services.time_utils import zone

logger = logging.getLogger(__name__)

# Model-call parameters. `max_tokens` keeps replies short (the persona is told to be
# concise); `timeout` carries the fail-fast posture so a stuck provider can't pin the
# request thread — on timeout we degrade to the fallback line.
MAX_TOKENS = 400
TIMEOUT_SECONDS = 8.0

# Send only the most recent turns to the model — an input-token cap that also keeps the
# reply focused on the live thread. The client may hold a longer history for display.
MAX_HISTORY_TURNS = 12

# Defensive cap on the model's own reply length (untrusted output). max_tokens already
# bounds it; this is a belt-and-braces truncation so a runaway response can't be relayed
# verbatim. ~2000 chars is well above a normal few-sentence reply.
MAX_REPLY_LEN = 2000

# Per-user daily message ceiling → 429. Each message is a paid LLM call, so this caps
# spend/abuse per account. Kept comfortably above ordinary reflective use.
DAILY_MESSAGE_CAP = 30

# A gentle, persona-neutral line returned when the model is unavailable or its output is
# empty — reads well in any tradition's voice.
FALLBACK_REPLY = "Let us pause a moment and return to this shortly."


# ── Per-user daily message counter ────────────────────────────────────────────
# A lightweight in-memory counter keyed on (user, their local day), using the same
# local-day logic as app/core/limits.py. It is PER-WORKER (not shared across processes)
# — an accepted trade-off matching the codebase's existing in-memory throttles; moving
# it to Redis is the future step once there is more than one worker to coordinate.
# There is no chat table to COUNT rows from (stateless v1), so we count in memory rather
# than reuse `enforce_daily_create_cap`.
_daily_counts: dict[uuid.UUID, tuple[str, int]] = {}
_daily_lock = threading.Lock()


def _local_day_key(user: User) -> str:
    """The user's current local date (ISO), so the cap window rolls over at their local
    midnight — matching how `app/core/limits.py` buckets the day."""
    return datetime.now(zone(user.timezone)).date().isoformat()


def _enforce_daily_message_cap(user: User) -> None:
    """Count one message against the user's daily allowance, raising DailyLimitError
    (→ 429) once the cap is reached. Resets when the user's local day changes."""
    today = _local_day_key(user)
    with _daily_lock:
        day, count = _daily_counts.get(user.id, (today, 0))
        if day != today:
            count = 0  # new local day → fresh allowance
        if count >= DAILY_MESSAGE_CAP:
            raise DailyLimitError()
        _daily_counts[user.id] = (today, count + 1)


# ── Public API ────────────────────────────────────────────────────────────────


def list_personas() -> list[PhilosopherSummary]:
    """The picker roster — id, name, tradition, blurb, openers. Never the system prompts."""
    return [
        PhilosopherSummary(
            id=p.id,
            name=p.name,
            tradition=p.tradition,
            blurb=p.blurb,
            openers=list(p.openers),
        )
        for p in philosophers.PHILOSOPHERS
    ]


def _generate_reply(persona: philosophers.Persona, turns: list[ChatTurn]) -> tuple[str, str]:
    """Call the LLM for the persona's next reply, returning (reply_text, source). Degrades
    to (FALLBACK_REPLY, "fallback") on any failure/empty — never raises. Metadata-only logs."""
    # Input-token guard: only the most recent turns reach the model.
    trimmed = turns[-MAX_HISTORY_TURNS:]
    messages = [{"role": t.role, "content": t.content} for t in trimmed]
    # Per-guide tuning (temperature + reply budget) shapes the voice on providers that
    # honour it; the shared MAX_TOKENS is the fallback ceiling. See Persona for the caveat
    # that the default GPT-5 path ignores temperature and floors the token budget.
    result = llm_client.chat(
        system=persona.system,
        messages=messages,
        max_tokens=min(persona.max_tokens, MAX_TOKENS),
        timeout=TIMEOUT_SECONDS,
        temperature=persona.temperature,
    )
    if result is None:
        logger.info(
            "philosopher chat fallback philosopher=%s prompt=%s",
            persona.id,
            philosophers.PROMPT_VERSION,
        )
        return FALLBACK_REPLY, "fallback"

    text, model_id = result
    reply_text = text.strip()
    if not reply_text:
        return FALLBACK_REPLY, "fallback"
    if len(reply_text) > MAX_REPLY_LEN:
        reply_text = reply_text[:MAX_REPLY_LEN].rstrip()
    logger.info(
        "philosopher chat ok philosopher=%s model=%s prompt=%s",
        persona.id,
        model_id,
        philosophers.PROMPT_VERSION,
    )
    return reply_text, "ai"


def _derive_title(messages: list[dict]) -> str:
    """A short list label from the first user message (first line, capped). Falls back to a
    neutral word if somehow there's no user text."""
    first_user = next(
        (m["content"] for m in messages if m.get("role") == "user" and m.get("content")),
        "",
    )
    line = first_user.strip().splitlines()[0] if first_user.strip() else "Reflection"
    return line[:80]


def _get_owned_chat(
    db: DBSession, user_id: uuid.UUID, chat_id: uuid.UUID
) -> PhilosopherChat:
    """Load a saved conversation, scoped to its owner. Raises PhilosopherChatNotFoundError
    (→ 404) if it doesn't exist OR belongs to another user (no 403 → no id enumeration)."""
    chat = db.execute(
        select(PhilosopherChat).where(
            PhilosopherChat.id == chat_id, PhilosopherChat.user_id == user_id
        )
    ).scalar_one_or_none()
    if chat is None:
        raise PhilosopherChatNotFoundError()
    return chat


def reply(
    db: DBSession,
    user: User,
    philosopher_id: str,
    turns: list[ChatTurn],
    chat_id: uuid.UUID | None = None,
) -> PhilosopherChatResponse:
    """Generate the guide's next reply and persist the exchange to a saved conversation.

    When `chat_id` is given, the exchange is appended to (overwrites) that conversation,
    which must belong to `user`; otherwise a new conversation is created. Returns the reply
    plus the saved conversation's id.

    Raises PhilosopherNotFoundError (→ 404) for an unknown persona, PhilosopherChatNotFoundError
    (→ 404) for a chat_id the user doesn't own, GuestNotAllowedError (→ 403) for guests,
    DailyLimitError (→ 429) at the daily cap. Never raises for LLM failures — degrades to a
    gentle in-character fallback line (still persisted, so the thread stays intact).
    """
    persona = philosophers.BY_ID.get(philosopher_id)
    if persona is None:
        raise PhilosopherNotFoundError()

    # Guests are blocked from the paid LLM call. Mirrors the reflection coach.
    if user.is_guest:
        raise GuestNotAllowedError()

    # Verify ownership of an existing conversation BEFORE the cap/LLM, so a bad id neither
    # consumes the daily allowance nor triggers a paid call.
    chat = _get_owned_chat(db, user.id, chat_id) if chat_id is not None else None

    # Count this message against the per-user daily cap (429 when exceeded). Done after the
    # persona/guest/ownership checks so a rejected request doesn't consume the allowance.
    _enforce_daily_message_cap(user)

    reply_text, source = _generate_reply(persona, turns)

    # Persist the full client history (untrimmed — so reopening shows the whole thread) plus
    # this reply. Overwrites the existing row's messages, or creates a new conversation.
    stored: list[dict] = [{"role": t.role, "content": t.content} for t in turns]
    stored.append({"role": "assistant", "content": reply_text})
    if chat is None:
        chat = PhilosopherChat(
            user_id=user.id,
            philosopher_id=philosopher_id,
            title=_derive_title(stored),
            messages=stored,
        )
        db.add(chat)
    else:
        chat.messages = stored
    db.commit()
    db.refresh(chat)

    return PhilosopherChatResponse(reply=reply_text, source=source, chat_id=chat.id)


def list_chats(db: DBSession, user: User) -> list[PhilosopherChatSummary]:
    """The caller's saved conversations, newest-touched first."""
    rows = (
        db.execute(
            select(PhilosopherChat)
            .where(PhilosopherChat.user_id == user.id)
            .order_by(PhilosopherChat.updated_at.desc())
        )
        .scalars()
        .all()
    )
    return [PhilosopherChatSummary.model_validate(r) for r in rows]


def get_chat(db: DBSession, user: User, chat_id: uuid.UUID) -> PhilosopherChatDetail:
    """A saved conversation's full turns (owner-scoped; 404 otherwise)."""
    return PhilosopherChatDetail.model_validate(_get_owned_chat(db, user.id, chat_id))


def delete_chat(db: DBSession, user: User, chat_id: uuid.UUID) -> None:
    """Delete a saved conversation (owner-scoped; 404 otherwise)."""
    db.delete(_get_owned_chat(db, user.id, chat_id))
    db.commit()

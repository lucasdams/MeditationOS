"""Business logic for the "chat with a philosopher" feature.

v1 is stateless/ephemeral: the client holds the conversation and sends the (bounded)
history each turn, so there is no chat table and nothing is persisted. This service
picks the persona, enforces the safety/cost guards, and calls the shared provider-
agnostic LLM seam (`llm_client.chat`) — degrading to a gentle in-character fallback
line, never raising, on any LLM failure. It DOES raise the domain errors
(404 unknown persona, 403 guest, 429 daily cap) so the route maps them to HTTP.

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

from app.core.exceptions import (
    DailyLimitError,
    GuestNotAllowedError,
    PhilosopherNotFoundError,
)
from app.models.user import User
from app.prompts import philosophers
from app.schemas.philosopher import (
    ChatTurn,
    PhilosopherChatResponse,
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


def reply(
    user: User, philosopher_id: str, turns: list[ChatTurn]
) -> PhilosopherChatResponse:
    """Generate the guide's next reply for `philosopher_id` given the conversation
    `turns` (validated, non-empty, each turn already length-bounded by the schema).

    Raises PhilosopherNotFoundError (→ 404) for an unknown persona, GuestNotAllowedError
    (→ 403) for guests, DailyLimitError (→ 429) at the daily cap. Never raises for LLM
    failures — degrades to a gentle in-character fallback line.
    """
    persona = philosophers.BY_ID.get(philosopher_id)
    if persona is None:
        raise PhilosopherNotFoundError()

    # Guests are blocked from the paid LLM call. Mirrors the reflection coach.
    # Future toggle: allow guests with a small per-guest cap instead of a hard block.
    if user.is_guest:
        raise GuestNotAllowedError()

    # Input-token guard: only the most recent turns reach the model.
    trimmed = turns[-MAX_HISTORY_TURNS:]

    # Count this message against the per-user daily cap (429 when exceeded). Done after
    # the persona/guest checks so a rejected request doesn't consume the allowance.
    _enforce_daily_message_cap(user)

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
        # Any LLM failure (no provider, timeout, empty) degrades gracefully. Metadata
        # only — the conversation content is never logged.
        logger.info(
            "philosopher chat fallback philosopher=%s prompt=%s",
            philosopher_id,
            philosophers.PROMPT_VERSION,
        )
        return PhilosopherChatResponse(reply=FALLBACK_REPLY, source="fallback")

    text, model_id = result
    reply_text = text.strip()
    if not reply_text:
        return PhilosopherChatResponse(reply=FALLBACK_REPLY, source="fallback")
    if len(reply_text) > MAX_REPLY_LEN:
        reply_text = reply_text[:MAX_REPLY_LEN].rstrip()
    logger.info(
        "philosopher chat ok philosopher=%s model=%s prompt=%s",
        philosopher_id,
        model_id,
        philosophers.PROMPT_VERSION,
    )
    return PhilosopherChatResponse(reply=reply_text, source="ai")

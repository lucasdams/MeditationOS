"""Request/response schemas for the "chat with a philosopher" feature.

The chat is stateless: the client holds the conversation and sends the history each
turn, so there is no ORM model here — just the wire shapes. Input caps (non-empty
content, a per-message length ceiling, a bounded history) are enforced here so malformed
or oversized payloads are rejected at the API boundary with a 422, before any LLM call.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

# A single message may not exceed this many characters — a cost/abuse guard on input
# tokens. Generous for a reflective message; well short of a prompt-stuffing payload.
MAX_CONTENT_LEN = 4000

# Hard ceiling on how many turns a request may carry. The service further truncates to
# the last few turns before calling the model; this is just a cheap payload-size guard
# so an enormous history is rejected up front rather than trimmed.
MAX_TURNS = 100


class ChatTurn(BaseModel):
    """One turn of the conversation as sent by the client."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str

    @field_validator("content")
    @classmethod
    def _non_empty_bounded(cls, value: str) -> str:
        """Reject empty/whitespace-only content, and content over the length cap. Kept
        as a validator (not just Field constraints) so whitespace-only turns are caught
        too. Returns the trimmed content."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("message content must not be empty")
        if len(trimmed) > MAX_CONTENT_LEN:
            raise ValueError(f"message content must be at most {MAX_CONTENT_LEN} characters")
        return trimmed


class PhilosopherChatRequest(BaseModel):
    """The full (bounded) conversation history the client sends each turn."""

    model_config = ConfigDict(extra="forbid")

    messages: list[ChatTurn]

    @field_validator("messages")
    @classmethod
    def _bounded_non_empty(cls, value: list[ChatTurn]) -> list[ChatTurn]:
        if not value:
            raise ValueError("messages must not be empty")
        if len(value) > MAX_TURNS:
            raise ValueError(f"messages must contain at most {MAX_TURNS} turns")
        return value


class PhilosopherSummary(BaseModel):
    """A persona as shown in the picker — no system prompt is ever exposed to clients."""

    id: str
    name: str
    tradition: str
    blurb: str
    # A few short, first-person conversation starters in the persona's theme. The client
    # shows them as tappable chips on an empty chat so a fresh conversation is an
    # invitation, not a blank page. The system prompt is never exposed — only these.
    openers: list[str]


class PhilosopherChatResponse(BaseModel):
    """The guide's reply, plus whether it came from the model or a curated fallback."""

    reply: str
    source: Literal["ai", "fallback"]

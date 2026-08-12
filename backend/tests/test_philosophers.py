"""Tests for the "chat with a philosopher" feature: the roster, the chat route's auth /
persona / validation / cap guards, and the fallback path.

The LLM call is patched at the service seam (`philosopher_service.llm_client.chat`) — we
never make a real network call.
"""

from unittest.mock import patch

import pytest

from app.prompts import philosophers
from app.services import philosopher_service

# Where the business service resolves the LLM call.
CHAT = "app.services.philosopher_service.llm_client.chat"
AI_RESULT = ("What is within your power right now?", "gpt-5-nano")

VALID = {"messages": [{"role": "user", "content": "I feel restless today."}]}


@pytest.fixture(autouse=True)
def _reset_daily_counts():
    """The per-user daily message counter is a process-lifetime in-memory dict; clear it
    around each test so counts don't leak across tests (mirrors conftest's guard reset)."""
    philosopher_service._daily_counts.clear()
    yield
    philosopher_service._daily_counts.clear()


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


# ── Roster ────────────────────────────────────────────────────────────────────


def test_list_requires_auth(client):
    assert client.get("/api/v1/philosophers").status_code == 401


def test_list_returns_full_roster(client):
    _auth(client, "plist@example.com")
    res = client.get("/api/v1/philosophers")
    assert res.status_code == 200
    body = res.json()
    ids = [p["id"] for p in body]
    assert ids == [
        "marcus-aurelius",
        "buddha",
        "confucius",
        "laozi",
        "eckhart-tolle",
        "carl-jung",
        "miyamoto-musashi",
    ]
    # Summaries carry the picker fields — and never the system prompt.
    for p in body:
        assert p["name"] and p["tradition"] and p["blurb"]
        assert "system" not in p


# ── Chat: auth ────────────────────────────────────────────────────────────────


def test_chat_requires_auth(client):
    with patch(CHAT) as chat:
        res = client.post("/api/v1/philosophers/marcus-aurelius/chat", json=VALID)
    assert res.status_code == 401
    chat.assert_not_called()  # no LLM call for an unauthenticated request


# ── Chat: happy path ──────────────────────────────────────────────────────────


def test_chat_returns_reply(client):
    _auth(client, "phappy@example.com")
    with patch(CHAT, return_value=AI_RESULT) as chat:
        res = client.post("/api/v1/philosophers/marcus-aurelius/chat", json=VALID)
    assert res.status_code == 200
    body = res.json()
    assert body["reply"] == AI_RESULT[0]
    assert body["source"] == "ai"
    # The persona's system prompt is sent; the raw model id never reaches the client.
    chat.assert_called_once()
    kwargs = chat.call_args.kwargs
    assert "Marcus Aurelius" in kwargs["system"] or "Stoic" in kwargs["system"]
    assert kwargs["messages"] == [{"role": "user", "content": "I feel restless today."}]
    assert "gpt-5-nano" not in res.text


def test_chat_truncates_history_to_last_turns(client):
    """Only the most recent MAX_HISTORY_TURNS reach the model (input-token guard)."""
    _auth(client, "ptrunc@example.com")
    turns = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"}
        for i in range(philosopher_service.MAX_HISTORY_TURNS + 6)
    ]
    with patch(CHAT, return_value=AI_RESULT) as chat:
        res = client.post(
            "/api/v1/philosophers/buddha/chat", json={"messages": turns}
        )
    assert res.status_code == 200
    sent = chat.call_args.kwargs["messages"]
    assert len(sent) == philosopher_service.MAX_HISTORY_TURNS
    assert sent[-1]["content"] == f"turn {len(turns) - 1}"


# ── Chat: fallback (LLM unavailable) ──────────────────────────────────────────


def test_chat_falls_back_when_llm_unavailable(client):
    _auth(client, "pfall@example.com")
    with patch(CHAT, return_value=None):
        res = client.post("/api/v1/philosophers/laozi/chat", json=VALID)
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "fallback"
    assert body["reply"] == philosopher_service.FALLBACK_REPLY


# ── Chat: guest gate ──────────────────────────────────────────────────────────


def test_guest_cannot_chat(client):
    client.post("/api/v1/auth/guest")
    with patch(CHAT) as chat:
        res = client.post("/api/v1/philosophers/confucius/chat", json=VALID)
    assert res.status_code == 403
    chat.assert_not_called()  # no paid LLM call for a guest


# ── Chat: unknown persona ─────────────────────────────────────────────────────


def test_unknown_philosopher_404(client):
    _auth(client, "p404@example.com")
    with patch(CHAT) as chat:
        res = client.post("/api/v1/philosophers/socrates/chat", json=VALID)
    assert res.status_code == 404
    chat.assert_not_called()


# ── Chat: input validation (422) ──────────────────────────────────────────────


def test_empty_messages_422(client):
    _auth(client, "pempty@example.com")
    with patch(CHAT) as chat:
        res = client.post(
            "/api/v1/philosophers/marcus-aurelius/chat", json={"messages": []}
        )
    assert res.status_code == 422
    chat.assert_not_called()


def test_empty_content_422(client):
    _auth(client, "pblank@example.com")
    with patch(CHAT) as chat:
        res = client.post(
            "/api/v1/philosophers/marcus-aurelius/chat",
            json={"messages": [{"role": "user", "content": "   "}]},
        )
    assert res.status_code == 422
    chat.assert_not_called()


def test_oversized_content_422(client):
    _auth(client, "pbig@example.com")
    from app.schemas.philosopher import MAX_CONTENT_LEN

    with patch(CHAT) as chat:
        res = client.post(
            "/api/v1/philosophers/marcus-aurelius/chat",
            json={"messages": [{"role": "user", "content": "x" * (MAX_CONTENT_LEN + 1)}]},
        )
    assert res.status_code == 422
    chat.assert_not_called()


# ── Chat: daily cap (429) ─────────────────────────────────────────────────────


def test_daily_cap_returns_429(client, monkeypatch):
    monkeypatch.setattr(philosopher_service, "DAILY_MESSAGE_CAP", 2)
    _auth(client, "pcap@example.com")
    with patch(CHAT, return_value=AI_RESULT):
        assert client.post("/api/v1/philosophers/buddha/chat", json=VALID).status_code == 200
        assert client.post("/api/v1/philosophers/buddha/chat", json=VALID).status_code == 200
        capped = client.post("/api/v1/philosophers/buddha/chat", json=VALID)
    assert capped.status_code == 429


# ── The service/roster themselves ─────────────────────────────────────────────


def test_roster_is_seven_distinct_personas():
    ids = [p.id for p in philosophers.PHILOSOPHERS]
    assert len(ids) == 7
    assert len(set(ids)) == 7
    # Every persona composes the shared boundaries into its system prompt.
    for p in philosophers.PHILOSOPHERS:
        assert "not a therapist" in p.system
        assert p.name in p.system or p.tradition.split()[0] in p.system


def test_list_personas_omits_system_prompt():
    summaries = philosopher_service.list_personas()
    assert len(summaries) == 7
    assert not hasattr(summaries[0], "system")

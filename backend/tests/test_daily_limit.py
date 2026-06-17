"""Tests for the per-user daily creation cap (anti-spam).

Every create endpoint that calls `enforce_daily_create_cap` is parametrized below, so
dropping the cap from any one service is caught here.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import settings

SESSION = {"type": "mindfulness", "duration_seconds": 600, "occurred_at": "2026-06-12T08:00:00Z"}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _future(days=1) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


# (label, path, body) for each capped create endpoint. Bodies are reused across calls;
# the cap counts rows regardless of content, so identical bodies are fine.
CAPPED_ENDPOINTS = [
    ("sessions", "/api/v1/sessions", SESSION),
    ("gratitude", "/api/v1/gratitude", {"category": "people", "text": "grateful"}),
    ("journals", "/api/v1/journals", {"body": "a reflection"}),
    ("goals", "/api/v1/goals", {"activity": "meditate", "period": "day", "count": 1}),
    ("mood_logs", "/api/v1/mood-logs", {"mood": "calm"}),
    (
        "biometric_readings",
        "/api/v1/biometric-readings",
        {"context": "resting", "bpm": 68, "measured_at": "2026-06-16T08:00:00Z"},
    ),
    (
        "scheduled_sessions",
        "/api/v1/scheduled-sessions",
        {"type": "mindfulness", "scheduled_at": _future()},
    ),
]


@pytest.mark.parametrize(
    "name,path,body", CAPPED_ENDPOINTS, ids=[e[0] for e in CAPPED_ENDPOINTS]
)
def test_create_is_capped_per_day(client, monkeypatch, name, path, body):
    monkeypatch.setattr(settings, "daily_create_limit", 2)
    _auth(client, f"cap-{name}@example.com")
    assert client.post(path, json=body).status_code == 201
    assert client.post(path, json=body).status_code == 201
    # The third in the same day is refused.
    assert client.post(path, json=body).status_code == 429


def test_cap_is_per_user(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 1)
    _auth(client, "capA@example.com")
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 201
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 429
    # A different user has their own quota.
    _auth(client, "capB@example.com")
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 201

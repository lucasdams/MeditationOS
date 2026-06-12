"""Tests for the per-user daily creation cap (anti-spam)."""

from app.core.config import settings

SESSION = {"type": "mindfulness", "duration_seconds": 600, "occurred_at": "2026-06-12T08:00:00"}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_session_creation_capped_per_day(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 2)
    _auth(client, "cap1@example.com")
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 201
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 201
    # The third in the same UTC day is refused.
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 429


def test_cap_is_per_user(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 1)
    _auth(client, "capA@example.com")
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 201
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 429
    # A different user has their own quota.
    _auth(client, "capB@example.com")
    assert client.post("/api/v1/sessions", json=SESSION).status_code == 201


def test_cap_applies_to_other_types(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 1)
    _auth(client, "capg@example.com")
    g = {"category": "people", "text": "grateful"}
    assert client.post("/api/v1/gratitude", json=g).status_code == 201
    assert client.post("/api/v1/gratitude", json=g).status_code == 429

"""Tests for in-app feedback: the authenticated write endpoint (persist + echo, auth
required, validation, daily cap) and the admin-only read inbox (gating + content)."""

import pytest
from sqlalchemy import text

from app.core.config import settings


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _login(client, email):
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _send(client, category="idea", message="Love the breathing timer.", path="/breathe"):
    body = {"category": category, "message": message}
    if path is not None:
        body["path"] = path
    return client.post("/api/v1/feedback", json=body)


def _verify_email(db_session, email: str) -> None:
    db_session.execute(
        text("UPDATE users SET email_verified = TRUE WHERE email = :email"),
        {"email": email},
    )
    db_session.commit()


@pytest.fixture
def as_admin(monkeypatch):
    def _designate(email: str) -> None:
        monkeypatch.setattr(settings, "admin_emails", email)

    return _designate


# ── write path ─────────────────────────────────────────────────────────────


def test_create_requires_auth(client):
    assert _send(client).status_code == 401


def test_create_persists_and_returns(client):
    _auth(client, "f1@example.com")
    res = _send(client, "bug", "The chart won't load.", "/analytics")
    assert res.status_code == 201
    body = res.json()
    assert body["category"] == "bug"
    assert body["message"] == "The chart won't load."
    assert body["path"] == "/analytics"
    assert "id" in body and "created_at" in body


def test_path_is_optional(client):
    _auth(client, "f2@example.com")
    assert _send(client, path=None).status_code == 201


def test_message_is_trimmed(client):
    _auth(client, "f3@example.com")
    body = _send(client, message="   spaced out   ").json()
    assert body["message"] == "spaced out"


def test_empty_message_rejected(client):
    _auth(client, "f4@example.com")
    assert _send(client, message="").status_code == 422
    assert _send(client, message="   ").status_code == 422  # whitespace-only


def test_oversized_message_rejected(client):
    _auth(client, "f5@example.com")
    assert _send(client, message="x" * 2001).status_code == 422


def test_invalid_category_rejected(client):
    _auth(client, "f6@example.com")
    assert _send(client, category="complaint").status_code == 422  # not in the set


def test_extra_fields_rejected(client):
    _auth(client, "f7@example.com")
    res = client.post(
        "/api/v1/feedback",
        json={"category": "idea", "message": "hi", "sneaky": "value"},
    )
    assert res.status_code == 422  # extra="forbid"


def test_daily_create_cap(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 2)
    _auth(client, "fcap@example.com")
    assert _send(client).status_code == 201
    assert _send(client).status_code == 201
    assert _send(client).status_code == 429  # over the per-day cap


# ── admin read path ────────────────────────────────────────────────────────


def test_admin_feedback_requires_auth(client):
    assert client.get("/api/v1/admin/feedback").status_code == 401


def test_admin_feedback_forbidden_for_non_admin(client):
    _auth(client, "normal@example.com")
    assert client.get("/api/v1/admin/feedback").status_code == 403


def test_admin_feedback_lists_content_with_sender_email(client, db_session, as_admin):
    # A normal user sends feedback.
    _auth(client, "sender@example.com")
    _send(client, "praise", "This app is a calm place.", "/spirit")

    # An admin reads the inbox.
    as_admin("boss@example.com")
    _auth(client, "boss@example.com")
    _verify_email(db_session, "boss@example.com")
    _login(client, "boss@example.com")

    res = client.get("/api/v1/admin/feedback")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    entry = next(e for e in body["entries"] if e["message"] == "This app is a calm place.")
    assert entry["category"] == "praise"
    assert entry["path"] == "/spirit"
    assert entry["email"] == "sender@example.com"


def test_admin_feedback_lists_all_notes(client, db_session, as_admin):
    _auth(client, "s2@example.com")
    _send(client, "idea", "first note")
    _send(client, "idea", "second note")

    as_admin("boss2@example.com")
    _auth(client, "boss2@example.com")
    _verify_email(db_session, "boss2@example.com")
    _login(client, "boss2@example.com")

    entries = client.get("/api/v1/admin/feedback").json()["entries"]
    messages = [e["message"] for e in entries]
    # Both rows share a created_at within the test transaction (Postgres now() is constant
    # per transaction), so assert presence, not sub-second ordering — the newest-first
    # `order_by(created_at.desc())` is exercised in prod where each note is its own
    # transaction. (Same convention as test_mood_logs.py.)
    assert "first note" in messages and "second note" in messages

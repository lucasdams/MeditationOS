"""Tests for the mood check-in routes: create, list (trend window), user-scoping,
validation, delete, and the daily create cap."""

from app.core.config import settings


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _checkin(client, mood="calm"):
    return client.post("/api/v1/mood-logs", json={"mood": mood})


def test_create_requires_auth(client):
    assert _checkin(client).status_code == 401


def test_list_requires_auth(client):
    assert client.get("/api/v1/mood-logs").status_code == 401


def test_create_and_list(client):
    _auth(client, "m1@example.com")
    assert _checkin(client, "focused").status_code == 201
    body = client.get("/api/v1/mood-logs").json()
    assert len(body) == 1
    assert body[0]["mood"] == "focused"
    assert "created_at" in body[0] and "id" in body[0]


def test_invalid_mood_rejected(client):
    _auth(client, "m2@example.com")
    assert _checkin(client, "ecstatic").status_code == 422  # not in the palette


def test_multiple_checkins_allowed_in_a_day(client):
    _auth(client, "m3@example.com")
    _checkin(client, "anxious")
    _checkin(client, "calm")  # mood can change through the day — both are kept
    body = client.get("/api/v1/mood-logs").json()
    # (Both rows share a created_at within the test transaction — Postgres now() is
    # constant per transaction — so assert presence, not sub-second ordering.)
    assert {b["mood"] for b in body} == {"calm", "anxious"}


def test_list_is_user_scoped(client):
    _auth(client, "owner@example.com")
    _checkin(client, "grateful")
    _auth(client, "other@example.com")  # different user
    assert client.get("/api/v1/mood-logs").json() == []


def test_days_window_filters(client):
    _auth(client, "m4@example.com")
    _checkin(client, "calm")
    assert len(client.get("/api/v1/mood-logs?days=7").json()) == 1


def test_delete_own_and_404_for_others(client):
    _auth(client, "del@example.com")
    log_id = _checkin(client, "content").json()["id"]
    assert client.delete(f"/api/v1/mood-logs/{log_id}").status_code == 204
    assert client.get("/api/v1/mood-logs").json() == []

    _auth(client, "intruder@example.com")
    other_id = _checkin(client, "tired").json()["id"]
    _auth(client, "del@example.com")  # back to the first user
    assert client.delete(f"/api/v1/mood-logs/{other_id}").status_code == 404


def test_daily_create_cap(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 2)
    _auth(client, "cap@example.com")
    assert _checkin(client).status_code == 201
    assert _checkin(client).status_code == 201
    assert _checkin(client).status_code == 429  # over the per-day cap

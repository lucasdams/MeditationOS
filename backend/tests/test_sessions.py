"""Tests for POST /api/v1/sessions and GET /api/v1/sessions."""

MINDFUL = {"type": "mindfulness", "duration_seconds": 600, "occurred_at": "2026-01-01T08:00:00"}


def _auth(client, email):
    """Register + log in, leaving the auth cookie on the client."""
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_create_session(client):
    _auth(client, "a@example.com")
    resp = client.post("/api/v1/sessions", json=MINDFUL)
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "mindfulness"
    assert body["duration_seconds"] == 600
    assert body["breaths_per_minute"] is None
    assert body["focus"] is None and body["calm"] is None
    assert "id" in body


def test_create_with_focus_calm_rating(client):
    _auth(client, "rate@example.com")
    resp = client.post("/api/v1/sessions", json={**MINDFUL, "focus": 4, "calm": 5})
    assert resp.status_code == 201
    body = resp.json()
    assert body["focus"] == 4 and body["calm"] == 5


def test_rating_out_of_range_rejected(client):
    _auth(client, "rate2@example.com")
    assert client.post("/api/v1/sessions", json={**MINDFUL, "focus": 6}).status_code == 422
    assert client.post("/api/v1/sessions", json={**MINDFUL, "calm": 0}).status_code == 422


def test_create_resonance_session_reports_bpm(client):
    _auth(client, "b@example.com")
    resp = client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing",
            "duration_seconds": 600,
            "occurred_at": "2026-01-01T08:00:00",
            "inhale_seconds": 5,
            "exhale_seconds": 5,
            "cycles_completed": 60,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["breaths_per_minute"] == 6.0


def test_create_requires_auth(client):
    resp = client.post("/api/v1/sessions", json=MINDFUL)
    assert resp.status_code == 401


def test_create_rejects_nonpositive_duration(client):
    _auth(client, "c@example.com")
    bad = {**MINDFUL, "duration_seconds": 0}
    assert client.post("/api/v1/sessions", json=bad).status_code == 422


def test_create_rejects_unknown_type(client):
    _auth(client, "d@example.com")
    bad = {**MINDFUL, "type": "not-a-type"}
    assert client.post("/api/v1/sessions", json=bad).status_code == 422


def test_list_requires_auth(client):
    assert client.get("/api/v1/sessions").status_code == 401


def test_list_returns_only_callers_sessions(client):
    _auth(client, "owner@example.com")
    client.post("/api/v1/sessions", json=MINDFUL)
    mine = client.get("/api/v1/sessions")
    assert mine.status_code == 200
    assert len(mine.json()) == 1

    # A different user must not see the owner's session.
    _auth(client, "other@example.com")
    theirs = client.get("/api/v1/sessions")
    assert theirs.status_code == 200
    assert theirs.json() == []


def test_list_filters_by_type(client):
    _auth(client, "filter@example.com")
    client.post("/api/v1/sessions", json=MINDFUL)
    client.post("/api/v1/sessions", json={**MINDFUL, "type": "walking"})

    walking = client.get("/api/v1/sessions?type=walking")
    assert walking.status_code == 200
    assert len(walking.json()) == 1
    assert walking.json()[0]["type"] == "walking"

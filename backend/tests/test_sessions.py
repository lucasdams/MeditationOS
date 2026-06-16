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


def test_duration_over_cap_rejected(client):
    # Security audit fix #3: an unbounded duration would inflate XP→level→coins.
    _auth(client, "huge@example.com")
    payload = {**MINDFUL, "duration_seconds": 86_401}  # > 24h cap
    assert client.post("/api/v1/sessions", json=payload).status_code == 422


def test_duration_at_cap_accepted(client):
    _auth(client, "atcap@example.com")
    payload = {**MINDFUL, "duration_seconds": 86_400}  # exactly 24h
    assert client.post("/api/v1/sessions", json=payload).status_code == 201


def test_unexpected_field_rejected(client):
    # extra="forbid" parity (audit fix #7).
    _auth(client, "extra@example.com")
    payload = {**MINDFUL, "surprise": "nope"}
    assert client.post("/api/v1/sessions", json=payload).status_code == 422


def test_client_token_makes_create_idempotent(client):
    _auth(client, "idem@example.com")
    payload = {**MINDFUL, "client_token": "abc-123"}
    first = client.post("/api/v1/sessions", json=payload)
    second = client.post("/api/v1/sessions", json=payload)
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]  # same row, not a duplicate
    assert len(client.get("/api/v1/sessions").json()) == 1


def test_beacon_saves_a_session_and_is_idempotent_with_manual_save(client):
    import json

    _auth(client, "beacon@example.com")
    payload = {**MINDFUL, "client_token": "tok-xyz"}
    # The beacon sends a raw (text/plain) JSON body, like navigator.sendBeacon does.
    res = client.post(
        "/api/v1/sessions/beacon",
        content=json.dumps(payload),
        headers={"Content-Type": "text/plain"},
    )
    assert res.status_code == 204
    assert len(client.get("/api/v1/sessions").json()) == 1
    # A later manual save of the same sit (same token) doesn't double it.
    manual = client.post("/api/v1/sessions", json=payload)
    assert manual.status_code == 201
    assert len(client.get("/api/v1/sessions").json()) == 1


def test_beacon_requires_auth(client):
    import json

    res = client.post(
        "/api/v1/sessions/beacon",
        content=json.dumps(MINDFUL),
        headers={"Content-Type": "text/plain"},
    )
    assert res.status_code == 401


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


# ── Intention field ──────────────────────────────────────────────────────────

def test_create_with_intention(client):
    _auth(client, "intent@example.com")
    resp = client.post("/api/v1/sessions", json={**MINDFUL, "intention": "Stay present"})
    assert resp.status_code == 201
    assert resp.json()["intention"] == "Stay present"


def test_intention_over_140_chars_rejected(client):
    _auth(client, "intent2@example.com")
    assert client.post(
        "/api/v1/sessions", json={**MINDFUL, "intention": "x" * 141}
    ).status_code == 422


def test_intention_is_null_by_default(client):
    _auth(client, "intent3@example.com")
    resp = client.post("/api/v1/sessions", json=MINDFUL)
    assert resp.status_code == 201
    assert resp.json()["intention"] is None


def test_patch_adds_intention_to_saved_session(client):
    """Reflection step: update focus/calm/intention on an already-saved session."""
    _auth(client, "patch-intent@example.com")
    created = client.post("/api/v1/sessions", json=MINDFUL)
    assert created.status_code == 201
    sid = created.json()["id"]

    patched = client.patch(
        f"/api/v1/sessions/{sid}",
        json={"focus": 4, "calm": 5, "intention": "Be here"},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["intention"] == "Be here"
    assert body["focus"] == 4 and body["calm"] == 5

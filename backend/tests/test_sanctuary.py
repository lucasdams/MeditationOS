"""Tests for the Sanctuary route (Phase 1: the read-only starter plant).

grow_cost=60 points, stage_count=5 → 0.2-wide progress bands. Practice points are
minutes practiced, resonance breathing ×3 (mirrors the XP unit).
"""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, occurred_at, seconds=600, type="mindfulness"):
    return client.post(
        "/api/v1/sessions",
        json={"type": type, "duration_seconds": seconds, "occurred_at": occurred_at},
    )


def test_sanctuary_requires_auth(client):
    assert client.get("/api/v1/sanctuary").status_code == 401


def test_fresh_user_is_a_bare_starter(client):
    _auth(client, "fresh@example.com")
    body = client.get("/api/v1/sanctuary").json()
    assert body["current"]["item_key"] == "tree"
    assert body["current"]["stage"] == 0
    assert body["current"]["stage_count"] == 5
    assert body["current"]["progress"] == 0.0
    assert body["completed"] == []


def test_progress_and_stage_from_practice(client):
    _auth(client, "halfway@example.com")
    # 30 minutes of mindfulness = 30 points = 0.5 of the 60-point grow cost.
    _session(client, "2026-01-01T08:00:00", seconds=1800)
    current = client.get("/api/v1/sanctuary").json()["current"]
    assert current["progress"] == 0.5
    assert current["stage"] == 2  # int(0.5 * 5)


def test_fully_grown_clamps_to_last_stage(client):
    _auth(client, "grown@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=6000)  # 100 min → past grow cost
    current = client.get("/api/v1/sanctuary").json()["current"]
    assert current["progress"] == 1.0
    assert current["stage"] == 4  # stage_count - 1, not 5


def test_resonance_breathing_counts_triple(client):
    _auth(client, "breath@example.com")
    # 20 min of breathing = 20 × 3 = 60 points → fully grown, vs 20 points if counted 1×.
    _session(client, "2026-01-01T08:00:00", seconds=1200, type="resonance_breathing")
    current = client.get("/api/v1/sanctuary").json()["current"]
    assert current["progress"] == 1.0
    assert current["stage"] == 4


def test_sanctuary_user_scoped(client):
    _auth(client, "owner2@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=1800)
    _auth(client, "other2@example.com")  # different user → fresh garden
    current = client.get("/api/v1/sanctuary").json()["current"]
    assert current["progress"] == 0.0
    assert current["stage"] == 0

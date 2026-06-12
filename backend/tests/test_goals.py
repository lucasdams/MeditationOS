"""Tests for /api/v1/goals — CRUD plus computed progress."""

from datetime import UTC, datetime


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session_today(client, seconds=600):
    today = datetime.now(UTC).date()
    return client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": seconds,
            "occurred_at": f"{today.isoformat()}T08:00:00",
        },
    )


def test_list_requires_auth(client):
    assert client.get("/api/v1/goals").status_code == 401


def test_create_starts_active_and_empty(client):
    _auth(client, "g1@example.com")
    res = client.post("/api/v1/goals", json={"type": "daily_minutes", "target": 10})
    assert res.status_code == 201
    body = res.json()
    assert body["type"] == "daily_minutes"
    assert body["target"] == 10
    assert body["status"] == "active"
    assert body["current"] == 0 and body["achieved"] is False and body["progress"] == 0.0


def test_invalid_type_rejected(client):
    _auth(client, "g2@example.com")
    assert client.post("/api/v1/goals", json={"type": "weekly", "target": 5}).status_code == 422


def test_nonpositive_target_rejected(client):
    _auth(client, "g3@example.com")
    res = client.post("/api/v1/goals", json={"type": "streak_days", "target": 0})
    assert res.status_code == 422


def test_daily_minutes_achieved(client):
    _auth(client, "g4@example.com")
    _session_today(client, seconds=600)  # 10 minutes today
    client.post("/api/v1/goals", json={"type": "daily_minutes", "target": 10})
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["current"] == 10 and goal["achieved"] is True and goal["progress"] == 1.0


def test_daily_minutes_partial_progress(client):
    _auth(client, "g5@example.com")
    _session_today(client, seconds=300)  # 5 minutes
    client.post("/api/v1/goals", json={"type": "daily_minutes", "target": 10})
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["current"] == 5 and goal["achieved"] is False and goal["progress"] == 0.5


def test_streak_days_progress(client):
    _auth(client, "g6@example.com")
    _session_today(client)
    client.post("/api/v1/goals", json={"type": "streak_days", "target": 1})
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["current"] == 1 and goal["achieved"] is True


def test_total_hours_progress(client):
    _auth(client, "g7@example.com")
    _session_today(client, seconds=3600)  # 1 hour
    client.post("/api/v1/goals", json={"type": "total_hours", "target": 1})
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["current"] == 1 and goal["achieved"] is True


def test_list_is_user_scoped(client):
    _auth(client, "mine@example.com")
    client.post("/api/v1/goals", json={"type": "streak_days", "target": 3})
    _auth(client, "other@example.com")
    assert client.get("/api/v1/goals").json() == []


def test_archive_via_patch_and_status_filter(client):
    _auth(client, "g8@example.com")
    gid = client.post("/api/v1/goals", json={"type": "streak_days", "target": 5}).json()["id"]
    res = client.patch(f"/api/v1/goals/{gid}", json={"status": "archived"})
    assert res.status_code == 200 and res.json()["status"] == "archived"
    assert client.get("/api/v1/goals?status=active").json() == []
    assert len(client.get("/api/v1/goals?status=archived").json()) == 1


def test_update_target(client):
    _auth(client, "g9@example.com")
    gid = client.post("/api/v1/goals", json={"type": "total_hours", "target": 10}).json()["id"]
    res = client.patch(f"/api/v1/goals/{gid}", json={"target": 20})
    assert res.status_code == 200 and res.json()["target"] == 20


def test_get_and_delete_scoped(client):
    _auth(client, "del@example.com")
    gid = client.post("/api/v1/goals", json={"type": "streak_days", "target": 2}).json()["id"]
    _auth(client, "nope@example.com")
    assert client.get(f"/api/v1/goals/{gid}").status_code == 404
    assert client.delete(f"/api/v1/goals/{gid}").status_code == 404
    _auth(client, "del@example.com")
    assert client.delete(f"/api/v1/goals/{gid}").status_code == 204
    assert client.get(f"/api/v1/goals/{gid}").status_code == 404

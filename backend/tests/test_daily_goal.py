"""Tests for POST /api/v1/auth/daily-goal and the daily_goal_minutes default."""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_set_daily_goal_requires_auth(client):
    assert client.post("/api/v1/auth/daily-goal", json={"minutes": 20}).status_code == 401


def test_new_user_daily_goal_defaults_to_10(client):
    _auth(client, "goal_default@example.com")
    assert client.get("/api/v1/auth/me").json()["daily_goal_minutes"] == 10


def test_set_daily_goal(client):
    _auth(client, "goal_set@example.com")
    resp = client.post("/api/v1/auth/daily-goal", json={"minutes": 25})
    assert resp.status_code == 200
    assert resp.json()["daily_goal_minutes"] == 25
    assert client.get("/api/v1/auth/me").json()["daily_goal_minutes"] == 25


def test_daily_goal_out_of_range_rejected(client):
    _auth(client, "goal_bad@example.com")
    # Below the minimum (1) and above the maximum (120) → 422, goal unchanged.
    assert client.post("/api/v1/auth/daily-goal", json={"minutes": 0}).status_code == 422
    assert client.post("/api/v1/auth/daily-goal", json={"minutes": 121}).status_code == 422
    assert client.get("/api/v1/auth/me").json()["daily_goal_minutes"] == 10


def test_daily_goal_accepts_range_bounds(client):
    _auth(client, "goal_bounds@example.com")
    assert client.post("/api/v1/auth/daily-goal", json={"minutes": 1}).status_code == 200
    assert client.post("/api/v1/auth/daily-goal", json={"minutes": 120}).status_code == 200


def test_daily_goal_rejects_unknown_fields(client):
    _auth(client, "goal_extra@example.com")
    resp = client.post("/api/v1/auth/daily-goal", json={"minutes": 20, "bogus": True})
    assert resp.status_code == 422

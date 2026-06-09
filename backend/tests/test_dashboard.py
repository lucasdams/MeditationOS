"""Tests for the dashboard routes: /stats (totals + weekly) and /activity."""

from datetime import UTC, datetime


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, occurred_at, seconds=600, type="mindfulness"):
    return client.post(
        "/api/v1/sessions",
        json={"type": type, "duration_seconds": seconds, "occurred_at": occurred_at},
    )


def test_stats_requires_auth(client):
    assert client.get("/api/v1/dashboard/stats").status_code == 401


def test_stats_empty(client):
    _auth(client, "empty@example.com")
    body = client.get("/api/v1/dashboard/stats").json()
    assert body["total_seconds"] == 0
    assert body["session_count"] == 0
    assert len(body["this_week"]) == 7
    assert all(d["seconds"] == 0 for d in body["this_week"])


def test_stats_totals(client):
    _auth(client, "totals@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=600)
    _session(client, "2026-01-02T08:00:00", seconds=900)
    body = client.get("/api/v1/dashboard/stats").json()
    assert body["total_seconds"] == 1500
    assert body["session_count"] == 2


def test_stats_weekly_includes_today(client):
    _auth(client, "weekly@example.com")
    today = datetime.now(UTC).date()
    _session(client, f"{today.isoformat()}T08:00:00", seconds=1200)
    body = client.get("/api/v1/dashboard/stats").json()
    last = body["this_week"][-1]
    assert last["date"] == today.isoformat()
    assert last["seconds"] == 1200


def test_stats_user_scoped(client):
    _auth(client, "owner@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=600)
    _auth(client, "other@example.com")  # different user
    body = client.get("/api/v1/dashboard/stats").json()
    assert body["total_seconds"] == 0
    assert body["session_count"] == 0


def test_activity_requires_auth(client):
    assert client.get("/api/v1/dashboard/activity").status_code == 401


def test_activity_sparse_and_summed_per_day(client):
    _auth(client, "activity@example.com")
    today = datetime.now(UTC).date()
    _session(client, f"{today.isoformat()}T08:00:00", seconds=600)
    _session(client, f"{today.isoformat()}T17:00:00", seconds=300)  # same day → summed
    body = client.get("/api/v1/dashboard/activity").json()
    assert body["end"] == today.isoformat()
    assert len(body["days"]) == 1  # sparse: only the one active day
    assert body["days"][0] == {"date": today.isoformat(), "seconds": 900}


def test_activity_user_scoped(client):
    _auth(client, "act_owner@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=600)
    _auth(client, "act_other@example.com")  # different user
    body = client.get("/api/v1/dashboard/activity").json()
    assert body["days"] == []

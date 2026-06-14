"""Tests for GET /api/v1/dashboard/weekly-review — the computed 'your week' summary."""

from datetime import UTC, datetime, timedelta


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _at(days_ago: int) -> str:
    return f"{(datetime.now(UTC).date() - timedelta(days=days_ago)).isoformat()}T08:00:00"


def _session(client, days_ago, seconds=600, type="mindfulness"):
    return client.post(
        "/api/v1/sessions",
        json={"type": type, "duration_seconds": seconds, "occurred_at": _at(days_ago)},
    )


def test_requires_auth(client):
    assert client.get("/api/v1/dashboard/weekly-review").status_code == 401


def test_empty_week(client):
    _auth(client, "wr_empty@example.com")
    body = client.get("/api/v1/dashboard/weekly-review").json()
    assert body["minutes"] == 0
    assert body["sessions"] == 0
    assert body["active_days"] == 0
    assert body["top_mood"] is None
    assert body["mood_counts"] == {}


def test_aggregates_this_week(client):
    _auth(client, "wr_agg@example.com")
    _session(client, 0, seconds=600)  # today, 10 min
    _session(client, 0, seconds=300)  # today again, 5 min — same active day
    _session(client, 2, seconds=1200)  # 2 days ago, 20 min (longest)
    body = client.get("/api/v1/dashboard/weekly-review").json()
    assert body["minutes"] == 35  # (600 + 300 + 1200) / 60
    assert body["sessions"] == 3
    assert body["active_days"] == 2  # two distinct days
    assert body["longest_session_seconds"] == 1200


def test_last_week_comparison(client):
    _auth(client, "wr_prev@example.com")
    _session(client, 0, seconds=600)  # this week: 10 min
    _session(client, 8, seconds=900)  # last week (8 days ago): 15 min
    body = client.get("/api/v1/dashboard/weekly-review").json()
    assert body["minutes"] == 10
    assert body["last_week_minutes"] == 15


def test_top_mood_combines_checkins_and_journals(client):
    _auth(client, "wr_mood@example.com")
    client.post("/api/v1/mood-logs", json={"mood": "calm"})
    client.post("/api/v1/mood-logs", json={"mood": "calm"})
    client.post("/api/v1/journals", json={"body": "a clear sit", "mood": "focused"})
    body = client.get("/api/v1/dashboard/weekly-review").json()
    assert body["top_mood"] == "calm"  # 2 calm (check-ins) > 1 focused (journal)
    assert body["mood_counts"]["calm"] == 2
    assert body["mood_counts"]["focused"] == 1


def test_user_scoped(client):
    _auth(client, "wr_owner@example.com")
    _session(client, 0)
    _auth(client, "wr_other@example.com")
    assert client.get("/api/v1/dashboard/weekly-review").json()["sessions"] == 0

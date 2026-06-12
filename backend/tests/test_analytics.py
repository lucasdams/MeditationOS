"""Tests for GET /api/v1/analytics."""

from datetime import UTC, datetime


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, hour=8, type="mindfulness"):
    today = datetime.now(UTC).date()
    return client.post(
        "/api/v1/sessions",
        json={
            "type": type,
            "duration_seconds": 600,
            "occurred_at": f"{today.isoformat()}T{hour:02d}:00:00",
        },
    )


def _pg_dow(d) -> int:
    return (d.weekday() + 1) % 7  # Python Mon=0..Sun=6 → Postgres Sun=0..Sat=6


def test_requires_auth(client):
    assert client.get("/api/v1/analytics").status_code == 401


def test_empty_user(client):
    _auth(client, "anempty@example.com")
    body = client.get("/api/v1/analytics").json()
    assert body["total_sessions"] == 0
    assert body["total_minutes"] == 0
    assert body["by_type"] == []
    assert len(body["by_weekday"]) == 7 and all(w["count"] == 0 for w in body["by_weekday"])
    assert [t["bucket"] for t in body["by_time_of_day"]] == [
        "morning",
        "afternoon",
        "evening",
        "night",
    ]
    assert len(body["minutes_by_week"]) == 12
    assert body["moods"] == []


def test_aggregates(client):
    _auth(client, "an@example.com")
    today = datetime.now(UTC).date()
    _session(client, hour=8, type="mindfulness")  # morning
    _session(client, hour=20, type="resonance_breathing")  # evening
    client.post("/api/v1/journals", json={"body": "calm day", "mood": "calm"})

    body = client.get("/api/v1/analytics").json()
    assert body["total_sessions"] == 2
    assert body["total_minutes"] == 20
    assert body["days_practiced"] == 1

    types = {t["type"]: t for t in body["by_type"]}
    assert types["mindfulness"]["count"] == 1 and types["mindfulness"]["minutes"] == 10
    assert "resonance_breathing" in types

    weekday = {w["weekday"]: w["count"] for w in body["by_weekday"]}
    assert weekday[_pg_dow(today)] == 2

    tod = {t["bucket"]: t["count"] for t in body["by_time_of_day"]}
    assert tod["morning"] == 1 and tod["evening"] == 1

    assert len(body["minutes_by_week"]) == 12
    assert body["minutes_by_week"][-1]["minutes"] == 20  # this week

    moods = {m["mood"]: m["count"] for m in body["moods"]}
    assert moods["calm"] == 1


def test_user_scoped(client):
    _auth(client, "ownerA@example.com")
    _session(client)
    _auth(client, "otherA@example.com")
    assert client.get("/api/v1/analytics").json()["total_sessions"] == 0

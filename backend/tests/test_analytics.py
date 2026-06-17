"""Tests for GET /api/v1/analytics."""

from datetime import UTC, datetime


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, hour=8, type="mindfulness", calm=None, focus=None):
    today = datetime.now(UTC).date()
    body = {
        "type": type,
        "duration_seconds": 600,
        "occurred_at": f"{today.isoformat()}T{hour:02d}:00:00",
    }
    if calm is not None:
        body["calm"] = calm
    if focus is not None:
        body["focus"] = focus
    return client.post("/api/v1/sessions", json=body)


def _pg_dow(d) -> int:
    return (d.weekday() + 1) % 7  # Python Mon=0..Sun=6 → Postgres Sun=0..Sat=6


def test_requires_auth(client):
    resp = client.get("/api/v1/analytics")
    assert resp.status_code == 401
    assert "detail" in resp.json()


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
    assert len(body["mood_by_week"]) == 12 and all(w["counts"] == {} for w in body["mood_by_week"])
    assert body["ratings_by_week"] == []


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

    # Mood over time — this week's bucket records the calm entry.
    assert len(body["mood_by_week"]) == 12
    assert body["mood_by_week"][-1]["counts"].get("calm") == 1


def test_mood_checkins_feed_trends(client):
    """Standalone mood check-ins (MoodLog) combine with journal moods in both the
    overall distribution and the mood-over-time chart — making the check-in's
    "feeds your trends" promise true."""
    _auth(client, "an_moodlog@example.com")
    client.post("/api/v1/mood-logs", json={"mood": "calm"})
    client.post("/api/v1/mood-logs", json={"mood": "calm"})
    client.post("/api/v1/mood-logs", json={"mood": "tired"})
    client.post("/api/v1/journals", json={"body": "a calm day", "mood": "calm"})

    body = client.get("/api/v1/analytics").json()
    moods = {m["mood"]: m["count"] for m in body["moods"]}
    assert moods["calm"] == 3  # 2 check-ins + 1 journal
    assert moods["tired"] == 1
    # Distribution is most-common first.
    assert body["moods"][0]["mood"] == "calm"

    # Mood over time merges both sources into this week's bucket.
    assert body["mood_by_week"][-1]["counts"].get("calm") == 3
    assert body["mood_by_week"][-1]["counts"].get("tired") == 1


def test_ratings_by_week(client):
    """Calm/focus session self-ratings are averaged per week; only weeks with at
    least one rated session appear, and unrated weeks are omitted entirely."""
    _auth(client, "an_ratings@example.com")
    _session(client, calm=4, focus=2)
    _session(client, calm=2)  # focus left unrated
    _session(client)  # neither rated — contributes nothing to ratings

    body = client.get("/api/v1/analytics").json()
    weeks = body["ratings_by_week"]
    assert len(weeks) == 1  # only this week has rated sessions
    week = weeks[-1]
    assert week["calm"] == 3.0  # (4 + 2) / 2
    assert week["focus"] == 2.0  # only one focus rating
    assert week["rated_sessions"] == 2  # two sessions carried at least one rating


def test_ratings_empty_without_ratings(client):
    """Sessions without any calm/focus rating produce no rating weeks."""
    _auth(client, "an_noratings@example.com")
    _session(client)
    assert client.get("/api/v1/analytics").json()["ratings_by_week"] == []


def test_user_scoped(client):
    _auth(client, "ownerA@example.com")
    _session(client)
    _auth(client, "otherA@example.com")
    assert client.get("/api/v1/analytics").json()["total_sessions"] == 0

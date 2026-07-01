"""Tests for GET /api/v1/analytics."""

from datetime import UTC, date, datetime, timedelta


def _first_of_month(d: date) -> date:
    return d.replace(day=1)


def _prev_month_day(d: date) -> date:
    """A safe day inside the previous calendar month (the 15th of it)."""
    return _first_of_month(_first_of_month(d) - timedelta(days=1)).replace(day=15)


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(
    client, hour=8, type="mindfulness", calm=None, focus=None, on=None, seconds=600
):
    day = on or datetime.now(UTC).date()
    body = {
        "type": type,
        "duration_seconds": seconds,
        "occurred_at": f"{day.isoformat()}T{hour:02d}:00:00",
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

    # Month-vs-month is always present, zero-filled, with correct local-month boundaries.
    mc = body["monthly_comparison"]
    today = datetime.now(UTC).date()
    assert mc["this_month"]["month_start"] == _first_of_month(today).isoformat()
    assert mc["last_month"]["month_start"] == _prev_month_day(today).replace(day=1).isoformat()
    for side in ("this_month", "last_month"):
        assert mc[side]["minutes"] == 0
        assert mc[side]["sessions"] == 0
        assert mc[side]["days_practiced"] == 0
    assert mc["minutes_delta"] == 0
    assert mc["sessions_delta"] == 0
    assert mc["days_practiced_delta"] == 0


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


# --- Month-vs-month report ------------------------------------------------------


def test_monthly_comparison_counts_and_delta(client):
    """This-month vs last-month totals and a signed delta (▲/▼ vs last month)."""
    _auth(client, "an_month@example.com")
    today = datetime.now(UTC).date()
    last = _prev_month_day(today)

    # This month: two 10-minute sessions on two DISTINCT days when possible. Both days must be in
    # the past (the session endpoint clamps future dates), so on the 1st of the month there's only
    # one in-month day available and both sessions land on today → this month shows 1 practiced day.
    # Date-deterministic on any calendar date (fixes the 1st-of-month flake).
    first = _first_of_month(today)
    if today > first:
        second_day, expected_this_days = first, 2
    else:  # today IS the 1st — only one in-month day exists
        second_day, expected_this_days = today, 1
    _session(client, on=today, seconds=600)
    _session(client, on=second_day, seconds=600)
    # Last month: one 10-minute session on one day.
    _session(client, on=last, seconds=600)

    mc = client.get("/api/v1/analytics").json()["monthly_comparison"]
    assert mc["this_month"]["minutes"] == 20
    assert mc["this_month"]["sessions"] == 2
    assert mc["this_month"]["days_practiced"] == expected_this_days
    assert mc["last_month"]["minutes"] == 10
    assert mc["last_month"]["sessions"] == 1
    assert mc["last_month"]["days_practiced"] == 1
    # Deltas are this − last (positive ⇒ more than last month).
    assert mc["minutes_delta"] == 10
    assert mc["sessions_delta"] == 1
    assert mc["days_practiced_delta"] == expected_this_days - 1


def test_monthly_comparison_negative_delta(client):
    """A quieter month than the last reads as a negative (▼) delta."""
    _auth(client, "an_month_down@example.com")
    today = datetime.now(UTC).date()
    last = _prev_month_day(today)

    _session(client, on=today, seconds=600)  # this month: 10 min
    _session(client, on=last, seconds=600)
    _session(client, on=last.replace(day=16), seconds=600)  # last month: 20 min, 2 days

    mc = client.get("/api/v1/analytics").json()["monthly_comparison"]
    assert mc["this_month"]["minutes"] == 10
    assert mc["last_month"]["minutes"] == 20
    assert mc["minutes_delta"] == -10
    assert mc["days_practiced_delta"] == -1


def test_monthly_comparison_excludes_older_months(client):
    """Sessions older than last month don't leak into either bucket."""
    _auth(client, "an_month_old@example.com")
    today = datetime.now(UTC).date()
    # Two months ago, mid-month — outside both this-month and last-month windows.
    two_months_ago = _first_of_month(_prev_month_day(today)).replace(day=1)
    older = _first_of_month(two_months_ago - timedelta(days=1)).replace(day=15)
    _session(client, on=older, seconds=600)

    mc = client.get("/api/v1/analytics").json()["monthly_comparison"]
    assert mc["this_month"]["sessions"] == 0
    assert mc["last_month"]["sessions"] == 0


def test_monthly_comparison_user_scoped(client):
    """One user's sessions never count toward another's monthly comparison."""
    _auth(client, "an_month_owner@example.com")
    _session(client, on=datetime.now(UTC).date(), seconds=600)
    _auth(client, "an_month_other@example.com")
    mc = client.get("/api/v1/analytics").json()["monthly_comparison"]
    assert mc["this_month"]["sessions"] == 0
    assert mc["minutes_delta"] == 0

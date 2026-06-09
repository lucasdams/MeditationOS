"""Streak calculation via GET /api/v1/dashboard/stats."""

from datetime import UTC, datetime, timedelta


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _days_ago(n: int) -> str:
    return f"{(datetime.now(UTC).date() - timedelta(days=n)).isoformat()}T08:00:00"


def _log(client, days_ago: int):
    return client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": 600, "occurred_at": _days_ago(days_ago)},
    )


def _streaks(client):
    body = client.get("/api/v1/dashboard/stats").json()
    return body["current_streak_days"], body["longest_streak_days"]


def test_no_sessions(client):
    _auth(client, "s0@example.com")
    assert _streaks(client) == (0, 0)


def test_single_day_today(client):
    _auth(client, "s1@example.com")
    _log(client, 0)
    assert _streaks(client) == (1, 1)


def test_consecutive_run_ending_today(client):
    _auth(client, "s2@example.com")
    for d in (2, 1, 0):
        _log(client, d)
    assert _streaks(client) == (3, 3)


def test_yesterday_grace(client):
    # Sessions yesterday + day before, none today → streak still counts (grace).
    _auth(client, "s3@example.com")
    _log(client, 2)
    _log(client, 1)
    assert _streaks(client) == (2, 2)


def test_stale_streak_is_zero(client):
    # Last session 2 days ago → current streak lapsed; longest preserved.
    _auth(client, "s4@example.com")
    _log(client, 2)
    assert _streaks(client) == (0, 1)


def test_gap_resets_current_but_keeps_longest(client):
    _auth(client, "s5@example.com")
    for d in (6, 5, 4):  # a 3-day run last week
        _log(client, d)
    _log(client, 0)  # today, isolated
    assert _streaks(client) == (1, 3)


def test_same_day_counts_once(client):
    _auth(client, "s6@example.com")
    _log(client, 0)
    _log(client, 0)  # second session same day
    assert _streaks(client) == (1, 1)

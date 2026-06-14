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


def _rest_used(client):
    return client.get("/api/v1/dashboard/stats").json()["rest_day_used"]


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
    # Last session 3 days ago → two missed days in a row, beyond the one rest day, so
    # the current streak has lapsed; longest preserved.
    _auth(client, "s4@example.com")
    _log(client, 3)
    assert _streaks(client) == (0, 1)


def test_gap_resets_current_but_keeps_longest(client):
    _auth(client, "s5@example.com")
    for d in (6, 5, 4):  # a 3-day run last week
        _log(client, d)
    _log(client, 0)  # today, isolated (a 3-day gap — too wide for the rest day)
    assert _streaks(client) == (1, 3)


def test_rest_day_bridges_a_single_skip(client):
    # Practiced today, then days 2 and 3 ago — a single skipped day (yesterday). The
    # rest day bridges it, so the streak holds (the skipped day isn't counted).
    _auth(client, "s7@example.com")
    for d in (3, 2, 0):
        _log(client, d)
    assert _streaks(client) == (3, 3)
    assert _rest_used(client) is True


def test_rest_day_protects_a_lapsing_streak(client):
    # Practiced 2 days ago, nothing since: the rest day covers yesterday and today is
    # grace, so the streak survives at 1 rather than resetting to 0.
    _auth(client, "s8@example.com")
    _log(client, 2)
    assert _streaks(client) == (1, 1)
    assert _rest_used(client) is True


def test_two_consecutive_misses_end_the_streak(client):
    # Today + 3 days ago, with days 1 and 2 both skipped: two in a row is beyond the
    # one rest day, so only today's isolated session counts.
    _auth(client, "s9@example.com")
    _log(client, 3)
    _log(client, 0)
    assert _streaks(client) == (1, 1)
    assert _rest_used(client) is False


def test_full_run_does_not_use_a_rest_day(client):
    _auth(client, "s10@example.com")
    for d in (2, 1, 0):
        _log(client, d)
    assert _streaks(client) == (3, 3)
    assert _rest_used(client) is False


def test_same_day_counts_once(client):
    _auth(client, "s6@example.com")
    _log(client, 0)
    _log(client, 0)  # second session same day
    assert _streaks(client) == (1, 1)

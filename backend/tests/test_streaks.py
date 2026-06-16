"""Streak calculation via GET /api/v1/dashboard/stats."""

from datetime import UTC, date, datetime, timedelta

from app.services.time_utils import compute_streaks


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


# --- compute_streaks: the `longest` rule (rest bridges excluded) -------------------
# Documented rule: `longest` is the longest STRICTLY-consecutive run; rest-day bridges
# never extend it. They only ever extend the *current* streak, and the only time a
# bridge shows up in `longest` is the invariant guard that keeps current ≤ longest.


def test_longest_excludes_rest_bridge_in_a_past_run():
    # A past run of 3 days that contains a single-day gap (a bridge): days 10,9 then a
    # skipped day 8, then day 7. The current streak has long lapsed (today is much
    # later), so the bridge is NOT the current streak. `longest` must report the longest
    # strictly-consecutive sub-run (2), not 3 — the bridge is excluded consistently.
    today = date(2025, 1, 30)
    dates = {date(2025, 1, 20), date(2025, 1, 21), date(2025, 1, 23)}
    current, longest, rest_used = compute_streaks(dates, today)
    assert current == 0  # lapsed long ago
    assert longest == 2  # the 20–21 run; the 21→23 bridge is not folded in
    assert rest_used is False


def test_longest_at_least_current_invariant():
    # The current streak (with its bridge) can exceed any strictly-consecutive run.
    # `longest` is raised to it only to keep current ≤ longest.
    today = date(2025, 1, 30)
    # today, yesterday skipped (bridged), then 28th — current streak counts 2 real days
    # across a bridge; the longest strictly-consecutive run here is just 1.
    dates = {date(2025, 1, 30), date(2025, 1, 28)}
    current, longest, rest_used = compute_streaks(dates, today)
    assert current == 2
    assert rest_used is True
    assert longest >= current  # invariant holds; longest is bumped to 2

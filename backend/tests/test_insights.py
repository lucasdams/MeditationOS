"""Tests for GET /api/v1/analytics/insights — gentle pattern observations."""

import random
from datetime import date, timedelta

# Fixed anchor: all session dates are relative to this past date so the test
# is deterministic regardless of when (or at what UTC time) it runs.
_ANCHOR = date(2025, 1, 15)


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, *, hour=8, type="mindfulness", calm=None, focus=None, days_ago=0):
    day = _ANCHOR - timedelta(days=days_ago)
    payload = {
        "type": type,
        "duration_seconds": 600,
        "occurred_at": f"{day.isoformat()}T{hour:02d}:00:00",
    }
    if calm is not None:
        payload["calm"] = calm
    if focus is not None:
        payload["focus"] = focus
    return client.post("/api/v1/sessions", json=payload)


def _kinds(body):
    return {i["kind"] for i in body["insights"]}


def test_requires_auth(client):
    assert client.get("/api/v1/analytics/insights").status_code == 401


def test_needs_more_data_when_sparse(client):
    _auth(client, "sparse@example.com")
    # Two rated sits is below every threshold — no honest pattern yet.
    _session(client, calm=5)
    _session(client, calm=4)

    body = client.get("/api/v1/analytics/insights").json()
    assert body["needs_more_data"] is True
    assert body["insights"] == []


def test_time_of_day_calm_pattern(client):
    _auth(client, "morning@example.com")
    # A GENUINE effect with realistic within-group spread (not a perfectly clean split):
    # mornings cluster around 4–5, evenings around 1–2. The gap clears the stricter
    # multiple-comparisons effect-size bar even with some variance.
    morning_calm = [5, 4, 5, 4, 5, 4, 5, 4]
    evening_calm = [2, 1, 2, 1, 2, 1, 2, 1]
    for i, c in enumerate(morning_calm):
        _session(client, hour=7, calm=c, days_ago=i)
    for i, c in enumerate(evening_calm):
        _session(client, hour=20, calm=c, days_ago=i)

    body = client.get("/api/v1/analytics/insights").json()
    assert body["needs_more_data"] is False
    assert "time_of_day_calm" in _kinds(body)
    obs = next(i for i in body["insights"] if i["kind"] == "time_of_day_calm")
    assert "morning" in obs["detail"].lower()
    assert "session" in obs["basis"]  # states the basis it rests on


def test_breathing_vs_meditation_pattern(client):
    _auth(client, "breath@example.com")
    # Clearly separated distributions (breathing ~4–5, meditation ~1–2) with some
    # spread, so the effect size — not just the mean gap — carries the pattern.
    breathing_calm = [5, 4, 5, 4, 5, 4]
    meditation_calm = [2, 1, 2, 1, 2, 1]
    for i, c in enumerate(breathing_calm):
        _session(client, type="resonance_breathing", calm=c, days_ago=i)
    for i, c in enumerate(meditation_calm):
        _session(client, type="mindfulness", calm=c, days_ago=i)

    body = client.get("/api/v1/analytics/insights").json()
    assert "breathing_vs_meditation" in _kinds(body)
    obs = next(i for i in body["insights"] if i["kind"] == "breathing_vs_meditation")
    assert "breathing" in obs["detail"].lower()


def test_consistency_pattern(client):
    _auth(client, "consistent@example.com")
    # 12 distinct practice days, no ratings needed for this one.
    for d in range(12):
        _session(client, hour=9, days_ago=d)

    body = client.get("/api/v1/analytics/insights").json()
    assert "consistency" in _kinds(body)
    obs = next(i for i in body["insights"] if i["kind"] == "consistency")
    assert "12 days" in obs["basis"]


def test_user_scoped(client):
    _auth(client, "ownerI@example.com")
    for d in range(12):
        _session(client, hour=9, days_ago=d)

    _auth(client, "otherI@example.com")
    body = client.get("/api/v1/analytics/insights").json()
    assert body["needs_more_data"] is True
    assert body["insights"] == []


# --- Noise must NOT manufacture a pattern ---------------------------------------
# These are the key regression tests for the significance gate: random, overlapping
# calm ratings (no real effect) must not surface a time-of-day or breathing-vs-
# meditation "pattern". Before the effect-size test, the bucket max-select fired a
# false "calmest on mornings" the large majority of the time.

# Comparison observations that claim a DIRECTIONAL pattern from noise. (calm_trend
# always returns a "steady/up/down" insight and is excluded — on noise it reports
# "steady", which is honest, not a false pattern.)
_COMPARISON_KINDS = {"time_of_day_calm", "breathing_vs_meditation"}


def test_time_of_day_noise_reports_no_pattern(client):
    # A single user with plenty of rated sits spread across all four time buckets, but
    # calm drawn from the SAME overlapping distribution everywhere — no real effect.
    _auth(client, "tod_noise@example.com")
    rng = random.Random(1234)
    hours = [7, 14, 19, 23]  # morning / afternoon / evening / night
    for d in range(40):
        _session(client, hour=rng.choice(hours), calm=rng.randint(2, 4), days_ago=d % 30)

    body = client.get("/api/v1/analytics/insights").json()
    assert "time_of_day_calm" not in _kinds(body)


def test_breathing_vs_meditation_noise_reports_no_pattern(client):
    # Breathing and meditation rated from the same overlapping distribution — no effect.
    _auth(client, "bvm_noise@example.com")
    rng = random.Random(987)
    for d in range(30):
        _session(
            client, type="resonance_breathing", calm=rng.randint(2, 4), days_ago=d
        )
        _session(client, type="mindfulness", calm=rng.randint(2, 4), days_ago=d)

    body = client.get("/api/v1/analytics/insights").json()
    assert "breathing_vs_meditation" not in _kinds(body)


def test_false_positive_rate_is_low_over_many_noise_users(client):
    # Monte-Carlo: many independent users, each with PURE-NOISE calm ratings spread
    # across time buckets and practice types. The comparison observations should fire
    # on only a small fraction — proof the gate suppresses manufactured patterns.
    rng = random.Random(42)
    hours = [7, 14, 19, 23]
    trials = 25
    fired = 0
    for t in range(trials):
        _auth(client, f"fp_{t}@example.com")
        for d in range(36):
            _session(
                client,
                hour=rng.choice(hours),
                type=rng.choice(["mindfulness", "resonance_breathing"]),
                calm=rng.randint(1, 5),
                days_ago=d % 30,
            )
        kinds = _kinds(client.get("/api/v1/analytics/insights").json())
        if kinds & _COMPARISON_KINDS:
            fired += 1

    # Random ratings have no real time-of-day or practice-type effect; the gate should
    # let a false pattern slip through only occasionally (well under a quarter of users).
    assert fired <= trials // 4, f"false positives: {fired}/{trials}"

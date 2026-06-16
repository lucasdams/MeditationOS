"""Tests for GET /api/v1/analytics/insights — gentle pattern observations."""

from datetime import UTC, date, datetime, timedelta

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
    # Calmer mornings than evenings, well past the min-sample threshold.
    for d in range(5):
        _session(client, hour=7, calm=5, days_ago=d)
    for d in range(5):
        _session(client, hour=20, calm=2, days_ago=d)

    body = client.get("/api/v1/analytics/insights").json()
    assert body["needs_more_data"] is False
    assert "time_of_day_calm" in _kinds(body)
    obs = next(i for i in body["insights"] if i["kind"] == "time_of_day_calm")
    assert "morning" in obs["detail"].lower()
    assert "session" in obs["basis"]  # states the basis it rests on


def test_breathing_vs_meditation_pattern(client):
    _auth(client, "breath@example.com")
    for d in range(4):
        _session(client, type="resonance_breathing", calm=5, days_ago=d)
        _session(client, type="mindfulness", calm=2, days_ago=d)

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

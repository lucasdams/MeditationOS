"""Per-user timezone: setting it, and tz-aware date bucketing on the dashboard."""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_default_timezone_is_utc(client):
    _auth(client, "tz_default@example.com")
    assert client.get("/api/v1/auth/me").json()["timezone"] == "UTC"


def test_set_valid_timezone(client):
    _auth(client, "tz_set@example.com")
    res = client.post("/api/v1/auth/timezone", json={"timezone": "Asia/Tokyo"})
    assert res.status_code == 200
    assert res.json()["timezone"] == "Asia/Tokyo"
    assert client.get("/api/v1/auth/me").json()["timezone"] == "Asia/Tokyo"


def test_set_invalid_timezone_is_422(client):
    _auth(client, "tz_bad@example.com")
    assert client.post("/api/v1/auth/timezone", json={"timezone": "Mars/Phobos"}).status_code == 422


def test_timezone_requires_auth(client):
    assert client.post("/api/v1/auth/timezone", json={"timezone": "UTC"}).status_code == 401


def test_activity_buckets_in_user_timezone(client):
    _auth(client, "tz_bucket@example.com")
    # 23:30 UTC on Mar 15 is 08:30 on Mar 16 in Tokyo (UTC+9).
    client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 600,
            "occurred_at": "2026-03-15T23:30:00+00:00",
        },
    )
    # Default UTC → the practice lands on Mar 15.
    days_utc = [d["date"] for d in client.get("/api/v1/dashboard/activity").json()["days"]]
    assert days_utc == ["2026-03-15"]

    # Switch to Tokyo → the same instant now lands on Mar 16.
    client.post("/api/v1/auth/timezone", json={"timezone": "Asia/Tokyo"})
    days_tok = [d["date"] for d in client.get("/api/v1/dashboard/activity").json()["days"]]
    assert days_tok == ["2026-03-16"]

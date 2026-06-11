"""Tests for the liveness probe."""


def test_health_ok_no_auth(client):
    # Liveness probe must answer without a session cookie.
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

"""Tests for the standard security response headers."""


def test_security_headers_present(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"
    assert "Permissions-Policy" in res.headers
    assert res.headers["Cross-Origin-Opener-Policy"] == "same-origin"


def test_no_hsts_outside_production(client):
    # HSTS requires HTTPS — only emitted when ENVIRONMENT=production (tests run as test).
    res = client.get("/api/v1/health")
    assert "Strict-Transport-Security" not in res.headers

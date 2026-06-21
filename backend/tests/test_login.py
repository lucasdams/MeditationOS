"""Tests for login, logout, and the authenticated /me endpoint."""

from app.core.config import settings

CREDS = {"email": "auth@example.com", "password": "correct horse"}


def _register(client):
    assert client.post("/api/v1/auth/register", json=CREDS).status_code == 201


def _cookie_max_age(resp) -> int:
    """Pull the access_token cookie's Max-Age (seconds) from the Set-Cookie header."""
    for header in resp.headers.get_list("set-cookie"):
        if header.startswith("access_token="):
            for part in header.split(";"):
                key, _, value = part.strip().partition("=")
                if key.lower() == "max-age":
                    return int(value)
    raise AssertionError("no access_token Set-Cookie with Max-Age")


def test_login_sets_cookie_and_returns_user(client):
    _register(client)
    resp = client.post("/api/v1/auth/login", json=CREDS)
    assert resp.status_code == 200
    assert resp.json()["email"] == CREDS["email"]
    assert "access_token" in resp.cookies


def test_login_default_cookie_uses_standard_expiry(client):
    _register(client)
    resp = client.post("/api/v1/auth/login", json=CREDS)
    assert _cookie_max_age(resp) == settings.access_token_expire_minutes * 60


def test_login_remember_me_extends_cookie_lifetime(client):
    _register(client)
    resp = client.post("/api/v1/auth/login", json={**CREDS, "remember": True})
    assert resp.status_code == 200
    assert _cookie_max_age(resp) == settings.remember_me_expire_minutes * 60


def test_login_wrong_password_401(client):
    _register(client)
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": CREDS["email"], "password": "wrong"},
    )
    assert resp.status_code == 401


def test_login_unknown_email_401(client):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "correct horse"},
    )
    assert resp.status_code == 401


def test_me_requires_auth(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_returns_current_user_when_logged_in(client):
    _register(client)
    client.post("/api/v1/auth/login", json=CREDS)
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == CREDS["email"]


def test_logout_clears_session(client):
    _register(client)
    client.post("/api/v1/auth/login", json=CREDS)
    assert client.get("/api/v1/auth/me").status_code == 200

    assert client.post("/api/v1/auth/logout").status_code == 204
    # cookie cleared → no longer authenticated
    client.cookies.clear()
    assert client.get("/api/v1/auth/me").status_code == 401

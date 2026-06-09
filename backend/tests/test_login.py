"""Tests for login, logout, and the authenticated /me endpoint."""

CREDS = {"email": "auth@example.com", "password": "correct horse"}


def _register(client):
    assert client.post("/api/v1/auth/register", json=CREDS).status_code == 201


def test_login_sets_cookie_and_returns_user(client):
    _register(client)
    resp = client.post("/api/v1/auth/login", json=CREDS)
    assert resp.status_code == 200
    assert resp.json()["email"] == CREDS["email"]
    assert "access_token" in resp.cookies


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

"""Tests for POST /api/v1/auth/password."""

from app.core.security import create_access_token
from app.models.user import User


def _auth(client, email, password="correct horse"):
    client.post("/api/v1/auth/register", json={"email": email, "password": password})
    client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_change_password_requires_auth(client):
    res = client.post("/api/v1/auth/password", json={"new_password": "a new secret"})
    assert res.status_code == 401


def test_change_password_with_correct_current(client):
    _auth(client, "pw1@example.com")
    res = client.post(
        "/api/v1/auth/password",
        json={"current_password": "correct horse", "new_password": "a new secret"},
    )
    assert res.status_code == 200
    assert res.json()["has_password"] is True
    # The old password stops working; the new one logs in.
    client.post("/api/v1/auth/logout")
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "pw1@example.com", "password": "correct horse"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "pw1@example.com", "password": "a new secret"},
        ).status_code
        == 200
    )


def test_change_password_wrong_current_rejected(client):
    _auth(client, "pw2@example.com")
    res = client.post(
        "/api/v1/auth/password",
        json={"current_password": "not my password", "new_password": "a new secret"},
    )
    assert res.status_code == 401


def test_change_password_short_new_rejected(client):
    _auth(client, "pw3@example.com")
    res = client.post(
        "/api/v1/auth/password",
        json={"current_password": "correct horse", "new_password": "short"},
    )
    assert res.status_code == 422


def test_google_only_account_sets_first_password(client, db_session):
    # A passwordless (Google-only) account sets a password without a current one.
    user = User(email="goog@example.com", google_sub="g-123", password_hash=None)
    db_session.add(user)
    db_session.commit()
    assert user.has_password is False

    client.cookies.set("access_token", create_access_token(str(user.id)))
    res = client.post("/api/v1/auth/password", json={"new_password": "brand new pw"})
    assert res.status_code == 200
    assert res.json()["has_password"] is True
    # The account can now log in with email + password.
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "goog@example.com", "password": "brand new pw"},
        ).status_code
        == 200
    )

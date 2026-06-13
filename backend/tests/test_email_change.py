"""Tests for POST /api/v1/auth/email (change account email)."""


def _auth(client, email, password="correct horse"):
    client.post("/api/v1/auth/register", json={"email": email, "password": password})
    client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_change_email_requires_auth(client):
    res = client.post(
        "/api/v1/auth/email",
        json={"new_email": "new@example.com", "current_password": "correct horse"},
    )
    assert res.status_code == 401


def test_change_email_with_correct_password(client):
    _auth(client, "em1@example.com")
    res = client.post(
        "/api/v1/auth/email",
        json={"new_email": "moved@example.com", "current_password": "correct horse"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "moved@example.com"
    assert body["email_verified"] is False  # new address must be re-verified
    # The new email logs in; the old one no longer exists.
    client.post("/api/v1/auth/logout")
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "moved@example.com", "password": "correct horse"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "em1@example.com", "password": "correct horse"},
        ).status_code
        == 401
    )


def test_change_email_wrong_password_rejected(client):
    _auth(client, "em2@example.com")
    res = client.post(
        "/api/v1/auth/email",
        json={"new_email": "nope@example.com", "current_password": "not my password"},
    )
    assert res.status_code == 401


def test_change_email_to_taken_address_rejected(client):
    _auth(client, "taken@example.com")
    client.post("/api/v1/auth/logout")
    _auth(client, "em3@example.com")
    res = client.post(
        "/api/v1/auth/email",
        json={"new_email": "taken@example.com", "current_password": "correct horse"},
    )
    assert res.status_code == 409


def test_change_email_invalid_address_rejected(client):
    _auth(client, "em4@example.com")
    res = client.post(
        "/api/v1/auth/email",
        json={"new_email": "not-an-email", "current_password": "correct horse"},
    )
    assert res.status_code == 422

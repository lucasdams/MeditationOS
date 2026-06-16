"""Tests for POST /api/v1/auth/register."""


def test_register_happy_path(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "correct horse"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@example.com"
    assert "id" in body and "created_at" in body
    # password material must never be returned
    assert "password" not in body
    assert "password_hash" not in body


def test_register_duplicate_email_conflicts(client):
    payload = {"email": "dupe@example.com", "password": "correct horse"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    second = client.post("/api/v1/auth/register", json=payload)
    assert second.status_code == 409


def test_register_duplicate_is_case_insensitive(client):
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"email": "Case@Example.com", "password": "correct horse"},
        ).status_code
        == 201
    )
    # citext: different casing is the same email
    clash = client.post(
        "/api/v1/auth/register",
        json={"email": "case@example.com", "password": "correct horse"},
    )
    assert clash.status_code == 409


def test_register_invalid_email_422(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "correct horse"},
    )
    assert resp.status_code == 422


def test_register_short_password_422(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "shortpw@example.com", "password": "x"},
    )
    assert resp.status_code == 422


def test_register_rejects_unexpected_field(client):
    # extra="forbid" parity (audit fix #7) on the auth request schemas.
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "extra@example.com", "password": "correct horse", "is_admin": True},
    )
    assert resp.status_code == 422

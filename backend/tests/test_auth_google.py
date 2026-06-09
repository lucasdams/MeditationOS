"""Tests for POST /api/v1/auth/google (Sign in with Google).

The Google token verification is patched — we never call Google in tests; we
exercise the account create / link / reuse logic and error handling.
"""

from unittest.mock import patch

GOOGLE_VERIFY = "app.services.user_service.verify_id_token"


def _claims(email, sub, verified=True):
    return {"sub": sub, "email": email, "email_verified": verified}


def test_google_creates_new_user(client):
    with patch(GOOGLE_VERIFY, return_value=_claims("new@example.com", "google-1")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200
    assert res.json()["email"] == "new@example.com"
    assert res.json()["username"] is None
    # The session cookie is set, so /me now works.
    assert client.get("/api/v1/auth/me").json()["email"] == "new@example.com"


def test_google_same_sub_reuses_account(client):
    with patch(GOOGLE_VERIFY, return_value=_claims("repeat@example.com", "google-2")):
        first = client.post("/api/v1/auth/google", json={"credential": "tok"}).json()
        second = client.post("/api/v1/auth/google", json={"credential": "tok"}).json()
    assert first["id"] == second["id"]  # no duplicate account


def test_google_links_existing_password_account(client):
    # Register with email + password first.
    client.post(
        "/api/v1/auth/register",
        json={"email": "linkme@example.com", "password": "correct horse"},
    )
    with patch(GOOGLE_VERIFY, return_value=_claims("linkme@example.com", "google-3")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200
    # Same email → linked, and password login still works afterwards.
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "linkme@example.com", "password": "correct horse"},
    )
    assert login.status_code == 200


def test_google_invalid_token_is_401(client):
    with patch(GOOGLE_VERIFY, side_effect=ValueError("bad token")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 401


def test_google_unverified_email_is_401(client):
    claims = _claims("nope@example.com", "google-4", verified=False)
    with patch(GOOGLE_VERIFY, return_value=claims):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 401


def test_google_requires_credential(client):
    assert client.post("/api/v1/auth/google", json={}).status_code == 422

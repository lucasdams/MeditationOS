"""Regression tests for JWT type confusion (security audit fix #1).

A password-reset (`type:pwreset`) or email-verify (`type:emailverify`) token — both
signed with the same key, both carrying `sub`, and both travelling in URLs — must NOT
be accepted as the `access_token` cookie. The access token now carries `type:access`
and `decode_access_token` rejects anything else.
"""

import jwt

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    create_email_verification_token,
    create_password_reset_token,
    decode_access_token,
)

CREDS = {"email": "confuse@example.com", "password": "correct horse"}


# --- unit: decode_access_token ---------------------------------------------


def test_access_token_round_trips():
    token = create_access_token("user-123")
    assert decode_access_token(token) == "user-123"


def test_reset_token_rejected_as_access():
    reset = create_password_reset_token("user-123", "deadbeefdeadbeef")
    assert decode_access_token(reset) is None


def test_verify_token_rejected_as_access():
    verify = create_email_verification_token("user-123", "confuse@example.com")
    assert decode_access_token(verify) is None


def test_typeless_legacy_token_rejected_as_access():
    # Old access cookies carried no `type` claim — they are now invalid (re-login once).
    legacy = jwt.encode({"sub": "user-123"}, settings.secret_key, algorithm=ALGORITHM)
    assert decode_access_token(legacy) is None


# --- integration: takeover via the auth cookie ------------------------------


def _register_and_get_id(client) -> str:
    res = client.post("/api/v1/auth/register", json=CREDS)
    assert res.status_code == 201
    return res.json()["id"]


def test_reset_token_cannot_authenticate_me(client):
    user_id = _register_and_get_id(client)
    forged = create_password_reset_token(user_id, "deadbeefdeadbeef")
    client.cookies.set("access_token", forged)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_verify_token_cannot_authenticate_me(client):
    user_id = _register_and_get_id(client)
    forged = create_email_verification_token(user_id, CREDS["email"])
    client.cookies.set("access_token", forged)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_normal_access_token_still_authenticates_me(client):
    client.post("/api/v1/auth/register", json=CREDS)
    client.post("/api/v1/auth/login", json=CREDS)
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 200
    assert res.json()["email"] == CREDS["email"]

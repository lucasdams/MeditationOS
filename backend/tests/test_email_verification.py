"""Tests for email verification: send-on-register, confirm, resend, Google auto-verify."""

from unittest.mock import patch

from app.core.config import settings
from app.core.security import create_email_verification_token, create_password_reset_token
from app.services.notifications import email

VERIFY = "/api/v1/auth/verify-email"
RESEND = "/api/v1/auth/verify-email/resend"
GOOGLE_VERIFY = "app.services.user_service.verify_id_token"


def _capture(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email, "send_email", lambda to, subject, body: sent.append((to, subject, body)) or True
    )
    return sent


def _register(client, email_addr, password="correct horse"):
    client.post("/api/v1/auth/register", json={"email": email_addr, "password": password})


def _login(client, email_addr, password="correct horse"):
    client.post("/api/v1/auth/login", json={"email": email_addr, "password": password})


def _token_from(body: str) -> str:
    return body.split("token=", 1)[1].split()[0].strip()


def test_registration_sends_verification_email(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "verify1@example.com")
    assert len(sent) == 1
    assert sent[0][0] == "verify1@example.com"
    assert "/verify-email?token=" in sent[0][2]


def test_new_account_starts_unverified(client):
    _register(client, "verify2@example.com")
    _login(client, "verify2@example.com")
    assert client.get("/api/v1/auth/me").json()["email_verified"] is False


def test_verify_with_valid_token(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "verify3@example.com")
    token = _token_from(sent[0][2])

    assert client.post(VERIFY, json={"token": token}).status_code == 204
    _login(client, "verify3@example.com")
    assert client.get("/api/v1/auth/me").json()["email_verified"] is True


def test_verify_is_idempotent(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "verify4@example.com")
    token = _token_from(sent[0][2])
    assert client.post(VERIFY, json={"token": token}).status_code == 204
    assert client.post(VERIFY, json={"token": token}).status_code == 204  # still fine


def test_verify_garbage_token_rejected(client):
    assert client.post(VERIFY, json={"token": "not-a-token"}).status_code == 400


def test_verify_rejects_wrong_token_type(client):
    # A password-reset token must not double as a verification token.
    forged = create_password_reset_token("00000000-0000-0000-0000-000000000000", "deadbeef")
    assert client.post(VERIFY, json={"token": forged}).status_code == 400


def test_verify_expired_token_rejected(client, monkeypatch):
    monkeypatch.setattr(settings, "email_verification_expire_minutes", -1)
    token = create_email_verification_token(
        "00000000-0000-0000-0000-000000000000", "x@example.com"
    )
    assert client.post(VERIFY, json={"token": token}).status_code == 400


def test_resend_requires_auth(client):
    assert client.post(RESEND).status_code == 401


def test_resend_sends_for_unverified_user(client, monkeypatch):
    _capture(monkeypatch)  # swallow the registration email
    _register(client, "verify5@example.com")
    _login(client, "verify5@example.com")
    sent = _capture(monkeypatch)  # fresh capture for the resend
    assert client.post(RESEND).status_code == 202
    assert len(sent) == 1 and sent[0][0] == "verify5@example.com"


def test_resend_is_silent_for_verified_user(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "verify6@example.com")
    token = _token_from(sent[0][2])
    client.post(VERIFY, json={"token": token})
    _login(client, "verify6@example.com")
    sent.clear()
    assert client.post(RESEND).status_code == 202
    assert sent == []  # already verified → nothing sent


def test_google_login_is_auto_verified(client, monkeypatch):
    _capture(monkeypatch)
    claims = {"sub": "g-verify", "email": "googler@example.com", "email_verified": True}
    with patch(GOOGLE_VERIFY, return_value=claims):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200
    assert res.json()["email_verified"] is True

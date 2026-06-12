"""Tests for the forgot-password flow: request a link + reset with the token."""

import jwt

from app.core.config import settings
from app.core.security import ALGORITHM, create_password_reset_token
from app.models.user import User
from app.services.notifications import email

REQUEST = "/api/v1/auth/password/reset-request"
RESET = "/api/v1/auth/password/reset"


def _register(client, email_addr, password="correct horse"):
    client.post("/api/v1/auth/register", json={"email": email_addr, "password": password})


def _capture(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email, "send_email", lambda to, subject, body: sent.append((to, subject, body)) or True
    )
    return sent


def _token_from(body: str) -> str:
    # Link looks like {APP_BASE_URL}/reset-password?token=XXX
    return body.split("token=", 1)[1].split()[0].strip()


def test_request_emails_a_link_to_a_real_user(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "reset1@example.com")
    res = client.post(REQUEST, json={"email": "reset1@example.com"})
    assert res.status_code == 202
    assert len(sent) == 1 and sent[0][0] == "reset1@example.com"
    assert "/reset-password?token=" in sent[0][2]


def test_request_unknown_email_is_silent_but_same_response(client, monkeypatch):
    sent = _capture(monkeypatch)
    res = client.post(REQUEST, json={"email": "nobody@example.com"})
    assert res.status_code == 202  # no enumeration — identical to the hit case
    assert sent == []


def test_request_google_only_account_sends_nothing(client, monkeypatch, db_session):
    sent = _capture(monkeypatch)
    db_session.add(User(email="g@example.com", google_sub="g-1", password_hash=None))
    db_session.commit()
    res = client.post(REQUEST, json={"email": "g@example.com"})
    assert res.status_code == 202
    assert sent == []


def test_reset_with_valid_token_changes_password(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "reset2@example.com")
    client.post(REQUEST, json={"email": "reset2@example.com"})
    token = _token_from(sent[0][2])

    res = client.post(RESET, json={"token": token, "new_password": "a new secret"})
    assert res.status_code == 204
    # Old password no longer works; the new one does.
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "reset2@example.com", "password": "correct horse"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "reset2@example.com", "password": "a new secret"},
        ).status_code
        == 200
    )


def test_reset_token_is_single_use(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "reset3@example.com")
    client.post(REQUEST, json={"email": "reset3@example.com"})
    token = _token_from(sent[0][2])

    first = client.post(RESET, json={"token": token, "new_password": "first reset pw"})
    assert first.status_code == 204
    # Reusing the same token fails — the embedded password fingerprint no longer matches.
    reused = client.post(RESET, json={"token": token, "new_password": "second try pw"})
    assert reused.status_code == 400


def test_reset_with_garbage_token_rejected(client):
    res = client.post(RESET, json={"token": "not-a-token", "new_password": "a new secret"})
    assert res.status_code == 400


def test_reset_with_expired_token_rejected(client, monkeypatch):
    _register(client, "reset4@example.com")
    # Mint a token that's already expired.
    monkeypatch.setattr(settings, "password_reset_expire_minutes", -1)
    token = create_password_reset_token("00000000-0000-0000-0000-000000000000", "deadbeefdeadbeef")
    res = client.post(RESET, json={"token": token, "new_password": "a new secret"})
    assert res.status_code == 400


def test_reset_rejects_token_of_wrong_type(client):
    # An access-token-shaped JWT (no `type: pwreset`) must not be accepted as a reset.
    forged = jwt.encode({"sub": "x", "pwv": "y"}, settings.secret_key, algorithm=ALGORITHM)
    res = client.post(RESET, json={"token": forged, "new_password": "a new secret"})
    assert res.status_code == 400


def test_reset_short_password_rejected(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "reset5@example.com")
    client.post(REQUEST, json={"email": "reset5@example.com"})
    token = _token_from(sent[0][2])
    assert client.post(RESET, json={"token": token, "new_password": "short"}).status_code == 422

"""Security audit fix #6: a per-email cooldown on transactional sends
(reset-request / verify-resend) so IP rotation can't inbox-bomb one address.
Complements the per-IP limiter (disabled under tests).
"""

from app.core import send_guard
from app.services.notifications import email

REQUEST = "/api/v1/auth/password/reset-request"
RESEND = "/api/v1/auth/verify-email/resend"


def _capture(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email, "send_email", lambda to, subject, body: sent.append((to, subject, body)) or True
    )
    return sent


def _register(client, email_addr, password="correct horse"):
    client.post("/api/v1/auth/register", json={"email": email_addr, "password": password})


def test_reset_request_second_send_same_email_throttled(client, monkeypatch):
    send_guard.clear("cooldown1@example.com")
    _register(client, "cooldown1@example.com")
    _capture(monkeypatch)
    assert client.post(REQUEST, json={"email": "cooldown1@example.com"}).status_code == 202
    # Second immediate send to the same email is throttled.
    assert client.post(REQUEST, json={"email": "cooldown1@example.com"}).status_code == 429


def test_reset_request_different_email_not_throttled(client, monkeypatch):
    send_guard.clear("cooldown2a@example.com")
    send_guard.clear("cooldown2b@example.com")
    _register(client, "cooldown2a@example.com")
    _register(client, "cooldown2b@example.com")
    _capture(monkeypatch)
    assert client.post(REQUEST, json={"email": "cooldown2a@example.com"}).status_code == 202
    # A different address is on its own cooldown.
    assert client.post(REQUEST, json={"email": "cooldown2b@example.com"}).status_code == 202


def test_verify_resend_second_send_throttled(client, monkeypatch):
    send_guard.clear("cooldown3@example.com")
    _capture(monkeypatch)
    _register(client, "cooldown3@example.com")
    client.post(
        "/api/v1/auth/login",
        json={"email": "cooldown3@example.com", "password": "correct horse"},
    )
    assert client.post(RESEND).status_code == 202
    assert client.post(RESEND).status_code == 429

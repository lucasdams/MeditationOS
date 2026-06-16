"""Tests for the email-verification gate on data routes (REQUIRE_EMAIL_VERIFICATION).

The gate ships dark: off by default it is a pure no-op. Turned on, accounts with an
unconfirmed email get 403 from data routes, while Google sign-ins and guests (which
arrive verified) and the auth/verify routes stay reachable so users can still confirm.
"""

from app.core.config import settings
from app.services.notifications import email

# A representative gated data route — authenticated, simple GET.
STATS = "/api/v1/dashboard/stats"
ME = "/api/v1/auth/me"
RESEND = "/api/v1/auth/verify-email/resend"
VERIFY = "/api/v1/auth/verify-email"


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


def _verify_from(client, sent):
    token = sent[-1][2].split("token=", 1)[1].split()[0].strip()
    assert client.post(VERIFY, json={"token": token}).status_code == 204


def test_gate_off_by_default_allows_unverified(client):
    """Default config: an unconfirmed user reaches data routes (feature ships dark)."""
    _register(client, "gate_off@example.com")
    _login(client, "gate_off@example.com")
    assert settings.require_email_verification is False
    assert client.get(STATS).status_code == 200


def test_gate_on_blocks_unverified_user(client, monkeypatch):
    _register(client, "gate_block@example.com")
    _login(client, "gate_block@example.com")
    monkeypatch.setattr(settings, "require_email_verification", True)
    assert client.get(STATS).status_code == 403


def test_gate_on_allows_verified_user(client, monkeypatch):
    sent = _capture(monkeypatch)
    _register(client, "gate_ok@example.com")
    _verify_from(client, sent)
    _login(client, "gate_ok@example.com")
    monkeypatch.setattr(settings, "require_email_verification", True)
    assert client.get(STATS).status_code == 200


def test_gate_on_allows_guest(client, monkeypatch):
    """Guests arrive email_verified=True (synthetic address), so they are never gated."""
    client.post("/api/v1/auth/guest")
    monkeypatch.setattr(settings, "require_email_verification", True)
    assert client.get(STATS).status_code == 200


def test_gate_on_keeps_auth_routes_reachable(client, monkeypatch):
    """An unverified user must still reach the auth routes — otherwise they could never
    confirm. /me and resend stay open even with the gate on."""
    sent = _capture(monkeypatch)
    _register(client, "gate_auth@example.com")
    _login(client, "gate_auth@example.com")
    monkeypatch.setattr(settings, "require_email_verification", True)
    assert client.get(ME).status_code == 200
    assert client.get(ME).json()["email_verified"] is False
    assert client.post(RESEND).status_code == 202
    # And after confirming via the resent link, the data route opens up.
    _verify_from(client, sent)
    assert client.get(STATS).status_code == 200

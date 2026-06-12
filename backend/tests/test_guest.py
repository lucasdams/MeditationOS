"""Tests for guest accounts: POST /auth/guest and POST /auth/claim."""

from app.services.notifications import email


def _register(client, email_addr, password="correct horse"):
    client.post("/api/v1/auth/register", json={"email": email_addr, "password": password})


def _login(client, email_addr, password="correct horse"):
    client.post("/api/v1/auth/login", json={"email": email_addr, "password": password})


def test_guest_creates_signed_in_account(client):
    res = client.post("/api/v1/auth/guest")
    assert res.status_code == 200
    body = res.json()
    assert body["is_guest"] is True
    assert body["email_verified"] is True  # synthetic email never prompts a verify banner
    assert body["has_password"] is False
    assert body["username"]  # auto-assigned, so the guest skips the username gate
    # The cookie is set — the guest is logged in.
    assert client.get("/api/v1/auth/me").json()["is_guest"] is True


def test_guest_can_use_the_app(client):
    client.post("/api/v1/auth/guest")
    res = client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": 600, "occurred_at": "2026-06-12T08:00:00"},
    )
    assert res.status_code == 201


def test_claim_requires_auth(client):
    res = client.post(
        "/api/v1/auth/claim", json={"email": "x@example.com", "password": "a new secret"}
    )
    assert res.status_code == 401


def test_claim_converts_guest_to_real_account(client):
    client.post("/api/v1/auth/guest")
    res = client.post(
        "/api/v1/auth/claim",
        json={"email": "claimed@example.com", "password": "a real secret"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_guest"] is False
    assert body["has_password"] is True
    assert body["email"] == "claimed@example.com"
    assert body["email_verified"] is False  # a verification email is sent on claim
    # The account can now log in with the chosen email + password.
    client.post("/api/v1/auth/logout")
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "claimed@example.com", "password": "a real secret"},
        ).status_code
        == 200
    )


def test_claim_sends_verification_email(client, monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(email, "send_email", lambda to, s, b: sent.append((to, s, b)) or True)
    client.post("/api/v1/auth/guest")
    client.post("/api/v1/auth/claim", json={"email": "v@example.com", "password": "a real secret"})
    assert any(to == "v@example.com" for to, _, _ in sent)


def test_claim_rejects_taken_email(client):
    _register(client, "taken@example.com")
    client.post("/api/v1/auth/guest")
    res = client.post(
        "/api/v1/auth/claim",
        json={"email": "taken@example.com", "password": "a real secret"},
    )
    assert res.status_code == 409


def test_claim_rejects_non_guest(client):
    _register(client, "real@example.com")
    _login(client, "real@example.com")
    res = client.post(
        "/api/v1/auth/claim",
        json={"email": "new@example.com", "password": "a real secret"},
    )
    assert res.status_code == 400

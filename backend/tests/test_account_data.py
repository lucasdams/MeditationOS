"""Tests for data export (GET /auth/export) and account deletion (DELETE /auth/me)."""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client):
    client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": 600, "occurred_at": "2026-06-12T08:00:00"},
    )


# --- export -----------------------------------------------------------------


def test_export_requires_auth(client):
    assert client.get("/api/v1/auth/export").status_code == 401


def test_export_includes_account_and_owned_data(client):
    _auth(client, "exp@example.com")
    _session(client)
    client.post("/api/v1/gratitude", json={"category": "people", "text": "thanks"})
    body = client.get("/api/v1/auth/export").json()
    assert body["account"]["email"] == "exp@example.com"
    assert "password_hash" not in body["account"]  # never exported
    assert len(body["sessions"]) == 1
    assert len(body["gratitude"]) == 1
    assert set(body) >= {"account", "sessions", "gratitude", "journals", "goals", "sanctuary"}


def test_export_is_user_scoped(client):
    _auth(client, "owner2@example.com")
    _session(client)
    _auth(client, "other2@example.com")
    body = client.get("/api/v1/auth/export").json()
    assert body["sessions"] == []  # only the caller's data


# --- deletion ---------------------------------------------------------------


def test_delete_requires_auth(client):
    assert client.delete("/api/v1/auth/me").status_code == 401


def test_delete_removes_account_and_logs_out(client):
    _auth(client, "del@example.com")
    _session(client)
    assert client.delete("/api/v1/auth/me").status_code == 204
    # Session cleared + account gone — protected routes now 401.
    assert client.get("/api/v1/auth/me").status_code == 401
    # The email can be registered again (the row was actually deleted).
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"email": "del@example.com", "password": "correct horse"},
        ).status_code
        == 201
    )


def test_delete_cascades_to_owned_data(client, db_session):
    from app.models.session import Session as PracticeSession

    _auth(client, "cascade@example.com")
    _session(client)
    assert db_session.query(PracticeSession).count() == 1
    client.delete("/api/v1/auth/me")
    assert db_session.query(PracticeSession).count() == 0  # cascaded away

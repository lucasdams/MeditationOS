"""Tests for POST /api/v1/auth/username."""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_set_username_requires_auth(client):
    assert client.post("/api/v1/auth/username", json={"username": "alice"}).status_code == 401


def test_new_user_has_no_username(client):
    _auth(client, "fresh@example.com")
    assert client.get("/api/v1/auth/me").json()["username"] is None


def test_set_username(client):
    _auth(client, "u1@example.com")
    resp = client.post("/api/v1/auth/username", json={"username": "alice"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "alice"
    assert client.get("/api/v1/auth/me").json()["username"] == "alice"


def test_username_taken_is_case_insensitive(client):
    _auth(client, "owner@example.com")
    client.post("/api/v1/auth/username", json={"username": "Bob"})
    _auth(client, "other@example.com")
    assert client.post("/api/v1/auth/username", json={"username": "bob"}).status_code == 409


def test_invalid_username_rejected(client):
    _auth(client, "u2@example.com")
    assert client.post("/api/v1/auth/username", json={"username": "ab"}).status_code == 422
    assert client.post("/api/v1/auth/username", json={"username": "bad name!"}).status_code == 422


def test_can_change_own_username(client):
    _auth(client, "u3@example.com")
    client.post("/api/v1/auth/username", json={"username": "first"})
    resp = client.post("/api/v1/auth/username", json={"username": "second"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "second"


def test_username_integrity_error_is_409_not_500(client, db_session, monkeypatch):
    """If a concurrent request claims the same username between our pre-check and commit,
    the unique-constraint IntegrityError surfaces as 409, never an unhandled 500."""
    from sqlalchemy.exc import IntegrityError

    _auth(client, "u-race@example.com")
    real_commit = db_session.commit
    state = {"armed": True}

    def fake_commit(*args, **kwargs):
        if state["armed"]:
            state["armed"] = False
            raise IntegrityError("UPDATE users", {}, Exception("uq username"))
        return real_commit(*args, **kwargs)

    monkeypatch.setattr(db_session, "commit", fake_commit)
    res = client.post("/api/v1/auth/username", json={"username": "raced"})
    assert res.status_code == 409

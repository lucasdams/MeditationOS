"""Tests for GET/PATCH/DELETE /api/v1/sessions/{id} — incl. ownership (404)."""

import uuid

MINDFUL = {"type": "mindfulness", "duration_seconds": 600, "session_date": "2026-01-01"}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _create(client, email):
    _auth(client, email)
    return client.post("/api/v1/sessions", json=MINDFUL).json()["id"]


def test_get_owned_session(client):
    sid = _create(client, "g1@example.com")
    resp = client.get(f"/api/v1/sessions/{sid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == sid


def test_get_unowned_session_is_404(client):
    sid = _create(client, "owner1@example.com")
    _auth(client, "intruder1@example.com")  # different user
    assert client.get(f"/api/v1/sessions/{sid}").status_code == 404


def test_get_missing_session_is_404(client):
    _auth(client, "m1@example.com")
    assert client.get(f"/api/v1/sessions/{uuid.uuid4()}").status_code == 404


def test_patch_updates_fields(client):
    sid = _create(client, "p1@example.com")
    resp = client.patch(f"/api/v1/sessions/{sid}", json={"notes": "felt calm"})
    assert resp.status_code == 200
    assert resp.json()["notes"] == "felt calm"


def test_patch_unowned_is_404(client):
    sid = _create(client, "owner2@example.com")
    _auth(client, "intruder2@example.com")
    assert client.patch(f"/api/v1/sessions/{sid}", json={"notes": "x"}).status_code == 404


def test_delete_then_gone(client):
    sid = _create(client, "d1@example.com")
    assert client.delete(f"/api/v1/sessions/{sid}").status_code == 204
    assert client.get(f"/api/v1/sessions/{sid}").status_code == 404


def test_delete_unowned_is_404(client):
    sid = _create(client, "owner3@example.com")
    _auth(client, "intruder3@example.com")
    assert client.delete(f"/api/v1/sessions/{sid}").status_code == 404

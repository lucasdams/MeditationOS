"""Tests for /api/v1/breathing-patterns."""

from app.core.config import settings
from app.models.breathing_pattern import BreathingPattern

CUSTOM = {"name": "My slow", "inhale_seconds": 6, "exhale_seconds": 9}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _add_global_preset(db_session):
    # Tests build tables via create_all (no migrations), so seed a preset directly.
    db_session.add(
        BreathingPattern(
            name="6 bpm · balanced", inhale_seconds=4, exhale_seconds=6, is_preset=True
        )
    )
    db_session.commit()


def test_list_requires_auth(client):
    resp = client.get("/api/v1/breathing-patterns")
    assert resp.status_code == 401
    assert "detail" in resp.json()


def test_list_includes_global_presets(client, db_session):
    _add_global_preset(db_session)
    _auth(client, "p1@example.com")
    body = client.get("/api/v1/breathing-patterns").json()
    names = [p["name"] for p in body]
    assert "6 bpm · balanced" in names
    assert body[0]["breaths_per_minute"] == 6.0


def test_create_then_appears_in_list(client):
    _auth(client, "p2@example.com")
    resp = client.post("/api/v1/breathing-patterns", json=CUSTOM)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "My slow"
    assert body["is_preset"] is False
    assert body["breaths_per_minute"] == 4.0  # 60 / (6 + 9)
    assert any(p["name"] == "My slow" for p in client.get("/api/v1/breathing-patterns").json())


def test_create_validates_range(client):
    _auth(client, "p3@example.com")
    bad = {**CUSTOM, "inhale_seconds": 99}
    assert client.post("/api/v1/breathing-patterns", json=bad).status_code == 422


def test_create_daily_cap(client, monkeypatch):
    # Per-user, per-day creation cap (anti-spam) — mirrors sessions/gratitude/journals/goals.
    monkeypatch.setattr(settings, "daily_create_limit", 1)
    _auth(client, "pcap@example.com")
    assert client.post("/api/v1/breathing-patterns", json=CUSTOM).status_code == 201
    assert client.post("/api/v1/breathing-patterns", json=CUSTOM).status_code == 429


def test_delete_own_pattern(client):
    _auth(client, "p4@example.com")
    pid = client.post("/api/v1/breathing-patterns", json=CUSTOM).json()["id"]
    assert client.delete(f"/api/v1/breathing-patterns/{pid}").status_code == 204
    assert all(p["id"] != pid for p in client.get("/api/v1/breathing-patterns").json())


def test_cannot_delete_global_preset(client, db_session):
    _add_global_preset(db_session)
    _auth(client, "p5@example.com")
    preset = client.get("/api/v1/breathing-patterns").json()[0]
    assert client.delete(f"/api/v1/breathing-patterns/{preset['id']}").status_code == 404


def test_cannot_delete_others_pattern(client):
    _auth(client, "owner@example.com")
    pid = client.post("/api/v1/breathing-patterns", json=CUSTOM).json()["id"]
    _auth(client, "intruder@example.com")
    assert client.delete(f"/api/v1/breathing-patterns/{pid}").status_code == 404

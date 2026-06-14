"""Tests for scheduled sessions: CRUD, upcoming filter, user-scoping, validation,
and the .ics export."""

from datetime import UTC, datetime, timedelta

from app.core.config import settings


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _future(days=1) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _schedule(client, when=None, type="mindfulness", **extra):
    body = {"type": type, "scheduled_at": when or _future(), **extra}
    return client.post("/api/v1/scheduled-sessions", json=body)


def test_create_requires_auth(client):
    assert _schedule(client).status_code == 401


def test_create_and_list(client):
    _auth(client, "sc1@example.com")
    res = _schedule(client, type="body_scan", duration_minutes=20, note="evening sit")
    assert res.status_code == 201
    body = client.get("/api/v1/scheduled-sessions").json()
    assert len(body) == 1
    assert body[0]["type"] == "body_scan"
    assert body[0]["duration_minutes"] == 20
    assert body[0]["note"] == "evening sit"


def test_invalid_type_rejected(client):
    _auth(client, "sc2@example.com")
    assert _schedule(client, type="napping").status_code == 422


def test_nonpositive_duration_rejected(client):
    _auth(client, "sc3@example.com")
    assert _schedule(client, duration_minutes=0).status_code == 422


def test_upcoming_filter_hides_past(client):
    _auth(client, "sc4@example.com")
    _schedule(client, when=_future(2))  # future
    _schedule(client, when=(datetime.now(UTC) - timedelta(days=1)).isoformat())  # past
    upcoming = client.get("/api/v1/scheduled-sessions").json()
    assert len(upcoming) == 1
    all_rows = client.get("/api/v1/scheduled-sessions?upcoming=false").json()
    assert len(all_rows) == 2


def test_list_sorted_soonest_first(client):
    _auth(client, "sc5@example.com")
    _schedule(client, when=_future(5))
    _schedule(client, when=_future(2))
    rows = client.get("/api/v1/scheduled-sessions").json()
    assert rows[0]["scheduled_at"] < rows[1]["scheduled_at"]


def test_delete_own_and_404_for_others(client):
    _auth(client, "sc6@example.com")
    sid = _schedule(client).json()["id"]
    assert client.delete(f"/api/v1/scheduled-sessions/{sid}").status_code == 204
    assert client.get("/api/v1/scheduled-sessions").json() == []

    _auth(client, "sc7@example.com")
    other = _schedule(client).json()["id"]
    _auth(client, "sc6@example.com")
    assert client.delete(f"/api/v1/scheduled-sessions/{other}").status_code == 404


def test_list_is_user_scoped(client):
    _auth(client, "owner@example.com")
    _schedule(client)
    _auth(client, "other@example.com")
    assert client.get("/api/v1/scheduled-sessions").json() == []


def test_ics_export(client):
    _auth(client, "sc8@example.com")
    sid = _schedule(client, type="mindfulness", duration_minutes=15).json()["id"]
    res = client.get(f"/api/v1/scheduled-sessions/{sid}/ics")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/calendar")
    body = res.text
    assert "BEGIN:VCALENDAR" in body and "END:VCALENDAR" in body
    assert "BEGIN:VEVENT" in body
    assert "SUMMARY:Meditation: Mindfulness" in body


def test_ics_other_user_is_404(client):
    _auth(client, "sc9@example.com")
    sid = _schedule(client).json()["id"]
    _auth(client, "sc10@example.com")
    assert client.get(f"/api/v1/scheduled-sessions/{sid}/ics").status_code == 404


def test_daily_create_cap(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 1)
    _auth(client, "sccap@example.com")
    assert _schedule(client).status_code == 201
    assert _schedule(client).status_code == 429

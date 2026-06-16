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


# ── ICS text escaping (RFC 5545 property injection) ────────────────────────


def test_ics_escapes_comma_and_newline_in_note(client):
    """A note with commas and newlines must produce a single valid DESCRIPTION line
    with escaped values — no injected iCal properties."""
    _auth(client, "ics_escape@example.com")
    # A note that, without escaping, would inject an iCal property via newline.
    evil_note = "morning,\nevening\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:injected"
    sid = _schedule(client, note=evil_note).json()["id"]
    res = client.get(f"/api/v1/scheduled-sessions/{sid}/ics")
    assert res.status_code == 200
    body = res.text

    # The literal word "injected" must not appear as a top-level SUMMARY property.
    lines = body.splitlines()
    summary_lines = [line for line in lines if line.startswith("SUMMARY:")]
    assert len(summary_lines) == 1, "Only one SUMMARY line expected; injection detected"
    assert "injected" not in summary_lines[0]

    # The DESCRIPTION line must contain the escaped comma and \n sequences, not raw chars.
    desc_lines = [line for line in lines if line.startswith("DESCRIPTION:")]
    assert len(desc_lines) == 1, "Only one DESCRIPTION line expected; injection detected"
    assert "\\," in desc_lines[0] or "\\n" in desc_lines[0], (
        "Comma or newline in note must be escaped in DESCRIPTION"
    )
    # The raw newline must not appear inside DESCRIPTION (would break property boundary).
    assert "\n" not in desc_lines[0]


def test_ics_escapes_backslash_and_semicolon(client):
    """Backslash and semicolon in user text must be escaped per RFC 5545."""
    from app.services.scheduled_session_service import _ics_text

    result = _ics_text("back\\slash; semi")
    assert result == "back\\\\slash\\; semi"


def test_ics_strips_raw_cr(client):
    """Carriage returns in user text must be stripped (not passed raw to the ICS stream)."""
    from app.services.scheduled_session_service import _ics_text

    result = _ics_text("line one\r\nline two")
    # CR stripped; LF → \n escape
    assert "\r" not in result
    assert "\\n" in result

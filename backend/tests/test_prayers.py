"""Tests for /api/v1/prayers."""

from datetime import UTC, datetime

from app.core.config import settings

ENTRY = {"body": "May this day bring peace to all who need it."}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_list_requires_auth(client):
    assert client.get("/api/v1/prayers").status_code == 401


def test_create_requires_auth(client):
    assert client.post("/api/v1/prayers", json=ENTRY).status_code == 401


def test_create_and_list(client):
    _auth(client, "p1@example.com")
    res = client.post("/api/v1/prayers", json=ENTRY)
    assert res.status_code == 201
    body = res.json()
    assert body["body"] == ENTRY["body"]
    assert body["answered_at"] is None
    assert "created_at" in body
    listed = client.get("/api/v1/prayers").json()
    assert len(listed) == 1 and listed[0]["id"] == body["id"]


def test_empty_body_rejected(client):
    _auth(client, "p2@example.com")
    assert client.post("/api/v1/prayers", json={"body": ""}).status_code == 422


def test_whitespace_only_body_rejected(client):
    # A whitespace-only body must not store or earn XP.
    _auth(client, "p2ws@example.com")
    assert client.post("/api/v1/prayers", json={"body": "   \n\t "}).status_code == 422


def test_body_is_trimmed(client):
    _auth(client, "p2trim@example.com")
    res = client.post("/api/v1/prayers", json={"body": "  a quiet blessing  "})
    assert res.status_code == 201
    assert res.json()["body"] == "a quiet blessing"


def test_unexpected_field_rejected(client):
    _auth(client, "p2extra@example.com")
    res = client.post("/api/v1/prayers", json={"body": "hi", "denomination": "none"})
    assert res.status_code == 422


def test_list_is_user_scoped(client):
    _auth(client, "mine_p@example.com")
    client.post("/api/v1/prayers", json=ENTRY)
    _auth(client, "other_p@example.com")
    assert client.get("/api/v1/prayers").json() == []


def test_update_body(client):
    _auth(client, "p3@example.com")
    entry_id = client.post("/api/v1/prayers", json=ENTRY).json()["id"]
    res = client.patch(f"/api/v1/prayers/{entry_id}", json={"body": "An edited intention."})
    assert res.status_code == 200
    assert res.json()["body"] == "An edited intention."


def test_update_whitespace_only_body_rejected(client):
    _auth(client, "p3ws@example.com")
    entry_id = client.post("/api/v1/prayers", json=ENTRY).json()["id"]
    res = client.patch(f"/api/v1/prayers/{entry_id}", json={"body": "   "})
    assert res.status_code == 422


def test_mark_answered_toggles_answered_at(client):
    _auth(client, "p4@example.com")
    entry_id = client.post("/api/v1/prayers", json=ENTRY).json()["id"]
    # Mark answered — answered_at is set.
    marked = client.patch(f"/api/v1/prayers/{entry_id}", json={"answered": True})
    assert marked.status_code == 200
    assert marked.json()["answered_at"] is not None
    # Clear it — back to open.
    cleared = client.patch(f"/api/v1/prayers/{entry_id}", json={"answered": False})
    assert cleared.status_code == 200
    assert cleared.json()["answered_at"] is None


def test_answered_filter(client):
    _auth(client, "p5@example.com")
    open_id = client.post("/api/v1/prayers", json={"body": "still hoping"}).json()["id"]
    answered_id = client.post("/api/v1/prayers", json={"body": "came true"}).json()["id"]
    client.patch(f"/api/v1/prayers/{answered_id}", json={"answered": True})

    answered = client.get("/api/v1/prayers?answered=true").json()
    assert len(answered) == 1 and answered[0]["id"] == answered_id
    still_open = client.get("/api/v1/prayers?answered=false").json()
    assert len(still_open) == 1 and still_open[0]["id"] == open_id
    assert len(client.get("/api/v1/prayers").json()) == 2


def test_get_and_delete_scoped(client):
    _auth(client, "del_p@example.com")
    entry_id = client.post("/api/v1/prayers", json=ENTRY).json()["id"]
    _auth(client, "nope_p@example.com")
    # Another user's prayer id behaves as missing — 404, never 403 (no ID enumeration).
    assert client.get(f"/api/v1/prayers/{entry_id}").status_code == 404
    assert client.patch(f"/api/v1/prayers/{entry_id}", json={"body": "x"}).status_code == 404
    assert client.delete(f"/api/v1/prayers/{entry_id}").status_code == 404
    _auth(client, "del_p@example.com")
    assert client.delete(f"/api/v1/prayers/{entry_id}").status_code == 204
    assert client.get(f"/api/v1/prayers/{entry_id}").status_code == 404


def test_create_is_capped_per_day(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 2)
    _auth(client, "cap_p@example.com")
    assert client.post("/api/v1/prayers", json=ENTRY).status_code == 201
    assert client.post("/api/v1/prayers", json=ENTRY).status_code == 201
    # The third in the same day is refused.
    assert client.post("/api/v1/prayers", json=ENTRY).status_code == 429


def test_creating_a_prayer_awards_xp_like_a_journal(client):
    # Parity with a journal reflection: one prayer adds PRAYER_XP (5) to earned XP.
    # Prayers have no quest and don't start a streak, so the gain is exactly 5.
    _auth(client, "prayer_xp@example.com")
    before = client.get("/api/v1/dashboard/stats").json()
    assert before["xp"] == 0
    client.post("/api/v1/prayers", json=ENTRY)
    after = client.get("/api/v1/dashboard/stats").json()
    assert after["xp"] == 5


def test_answered_at_is_recent_utc(client):
    # The stamped answered_at should be ~now (a sanity check the toggle uses server time).
    _auth(client, "p_ts@example.com")
    entry_id = client.post("/api/v1/prayers", json=ENTRY).json()["id"]
    stamped = client.patch(f"/api/v1/prayers/{entry_id}", json={"answered": True}).json()
    answered_at = datetime.fromisoformat(stamped["answered_at"])
    delta = abs((datetime.now(UTC) - answered_at).total_seconds())
    assert delta < 300

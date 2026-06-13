"""Tests for /api/v1/journals."""

ENTRY = {"body": "Felt calmer after sitting today.", "mood": "calm"}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _make_session(client) -> str:
    res = client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 600,
            "occurred_at": "2026-06-12T07:30:00",
        },
    )
    return res.json()["id"]


def test_list_requires_auth(client):
    assert client.get("/api/v1/journals").status_code == 401


def test_create_requires_auth(client):
    assert client.post("/api/v1/journals", json=ENTRY).status_code == 401


def test_create_and_list(client):
    _auth(client, "j1@example.com")
    res = client.post("/api/v1/journals", json=ENTRY)
    assert res.status_code == 201
    body = res.json()
    assert body["body"] == ENTRY["body"]
    assert body["mood"] == "calm"
    assert body["session_id"] is None
    listed = client.get("/api/v1/journals").json()
    assert len(listed) == 1 and listed[0]["id"] == body["id"]


def test_mood_is_optional(client):
    _auth(client, "j2@example.com")
    res = client.post("/api/v1/journals", json={"body": "No mood today."})
    assert res.status_code == 201
    assert res.json()["mood"] is None


def test_invalid_mood_rejected(client):
    _auth(client, "j3@example.com")
    res = client.post("/api/v1/journals", json={"body": "x", "mood": "ecstatic"})
    assert res.status_code == 422


def test_empty_body_rejected(client):
    _auth(client, "j4@example.com")
    assert client.post("/api/v1/journals", json={"body": ""}).status_code == 422


def test_can_link_own_session(client):
    _auth(client, "j5@example.com")
    session_id = _make_session(client)
    res = client.post("/api/v1/journals", json={"body": "Good sit.", "session_id": session_id})
    assert res.status_code == 201
    assert res.json()["session_id"] == session_id


def test_cannot_link_another_users_session(client):
    _auth(client, "owner@example.com")
    session_id = _make_session(client)
    _auth(client, "intruder@example.com")
    res = client.post("/api/v1/journals", json={"body": "sneaky", "session_id": session_id})
    assert res.status_code == 404


def test_list_is_user_scoped(client):
    _auth(client, "mine@example.com")
    client.post("/api/v1/journals", json=ENTRY)
    _auth(client, "other@example.com")
    assert client.get("/api/v1/journals").json() == []


def test_list_filters_by_mood(client):
    _auth(client, "j6@example.com")
    client.post("/api/v1/journals", json={"body": "a", "mood": "calm"})
    client.post("/api/v1/journals", json={"body": "b", "mood": "tired"})
    calm = client.get("/api/v1/journals?mood=calm").json()
    assert len(calm) == 1 and calm[0]["mood"] == "calm"


def test_list_searches_body_text(client):
    _auth(client, "j6b@example.com")
    client.post("/api/v1/journals", json={"body": "Felt grateful and calm today"})
    client.post("/api/v1/journals", json={"body": "Restless, hard to settle"})
    # Case-insensitive substring match.
    res = client.get("/api/v1/journals?q=GRATEFUL").json()
    assert len(res) == 1 and "grateful" in res[0]["body"].lower()
    # A literal % is treated as text, not a wildcard.
    assert client.get("/api/v1/journals?q=%25").json() == []


def test_update_entry(client):
    _auth(client, "j7@example.com")
    entry_id = client.post("/api/v1/journals", json=ENTRY).json()["id"]
    res = client.patch(f"/api/v1/journals/{entry_id}", json={"body": "edited", "mood": "content"})
    assert res.status_code == 200
    assert res.json()["body"] == "edited" and res.json()["mood"] == "content"


def test_get_and_delete_scoped(client):
    _auth(client, "del@example.com")
    entry_id = client.post("/api/v1/journals", json=ENTRY).json()["id"]
    _auth(client, "nope@example.com")
    assert client.get(f"/api/v1/journals/{entry_id}").status_code == 404
    assert client.delete(f"/api/v1/journals/{entry_id}").status_code == 404
    _auth(client, "del@example.com")
    assert client.delete(f"/api/v1/journals/{entry_id}").status_code == 204
    assert client.get(f"/api/v1/journals/{entry_id}").status_code == 404

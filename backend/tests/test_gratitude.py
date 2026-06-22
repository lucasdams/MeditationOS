"""Tests for the gratitude routes: CRUD, user-scoping, and AI suggestions.

The AI suggester is patched — we never call the real Anthropic API.
"""

from unittest.mock import patch

SUGGESTER = "app.api.routes.gratitude.gratitude_suggester.suggest_options"


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _entry(client, category="people", text="A friend who checked in"):
    return client.post("/api/v1/gratitude", json={"category": category, "text": text})


def test_create_requires_auth(client):
    assert _entry(client).status_code == 401


def test_random_requires_auth(client):
    assert client.get("/api/v1/gratitude/random").status_code == 401


def test_random_404_when_empty(client):
    _auth(client, "grand_empty@example.com")
    assert client.get("/api/v1/gratitude/random").status_code == 404


def test_random_returns_an_owned_entry(client):
    _auth(client, "grand@example.com")
    ids = {_entry(client, text=f"moment {i}").json()["id"] for i in range(5)}
    got = client.get("/api/v1/gratitude/random")
    assert got.status_code == 200 and got.json()["id"] in ids


def test_create_and_read(client):
    _auth(client, "g1@example.com")
    res = _entry(client, "health", "A good night's sleep")
    assert res.status_code == 201
    body = res.json()
    assert body["category"] == "health"
    assert body["text"] == "A good night's sleep"
    assert "id" in body


def test_create_rejects_bad_category(client):
    _auth(client, "g2@example.com")
    res = client.post("/api/v1/gratitude", json={"category": "nonsense", "text": "x"})
    assert res.status_code == 422


def test_create_rejects_whitespace_only_text(client):
    # A whitespace-only entry must not store, light the quest, or earn XP.
    _auth(client, "g2ws@example.com")
    assert _entry(client, text="   \n ").status_code == 422


def test_create_trims_text(client):
    _auth(client, "g2trim@example.com")
    res = _entry(client, text="  a quiet morning  ")
    assert res.status_code == 201
    assert res.json()["text"] == "a quiet morning"


def test_create_custom_category(client):
    _auth(client, "gcustom@example.com")
    res = _entry(client, "custom", "A thought entirely my own")
    assert res.status_code == 201
    assert res.json()["category"] == "custom"


def test_list_returns_only_callers_entries(client):
    _auth(client, "owner@example.com")
    _entry(client)
    assert len(client.get("/api/v1/gratitude").json()) == 1
    _auth(client, "intruder@example.com")
    assert client.get("/api/v1/gratitude").json() == []


def test_list_filters_by_category(client):
    _auth(client, "g3@example.com")
    _entry(client, "people", "My family")
    _entry(client, "nature", "Sunshine")
    res = client.get("/api/v1/gratitude?category=nature").json()
    assert len(res) == 1
    assert res[0]["category"] == "nature"


def test_delete_own_entry(client):
    _auth(client, "g4@example.com")
    entry_id = _entry(client).json()["id"]
    assert client.delete(f"/api/v1/gratitude/{entry_id}").status_code == 204
    assert client.get("/api/v1/gratitude").json() == []


def test_cannot_delete_others_entry(client):
    _auth(client, "g5@example.com")
    entry_id = _entry(client).json()["id"]
    _auth(client, "g6@example.com")  # different user
    assert client.delete(f"/api/v1/gratitude/{entry_id}").status_code == 404


def test_suggestions_returns_options(client):
    _auth(client, "g7@example.com")
    options = ["A friend who checked in", "Someone who made me laugh"]
    with patch(SUGGESTER, return_value=options):
        res = client.get("/api/v1/gratitude/suggestions?category=people")
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "people"
    assert body["options"] == options


def test_suggestions_requires_auth(client):
    assert client.get("/api/v1/gratitude/suggestions?category=people").status_code == 401


def test_create_accepts_new_category(client):
    _auth(client, "g11@example.com")
    res = _entry(client, "spiritual", "A moment of awe")
    assert res.status_code == 201
    assert res.json()["category"] == "spiritual"


def test_suggestions_fallback_returns_max_options(client):
    from app.services.ai.gratitude_suggester import MAX_OPTIONS

    _auth(client, "g12@example.com")
    # Force the no-key path so we exercise the curated fallback (no real API call).
    with patch("app.services.ai.gratitude_suggester.settings.anthropic_api_key", ""):
        res = client.get("/api/v1/gratitude/suggestions?category=material")
    assert res.status_code == 200
    # The curated pools hold ~90 per category, so the fallback returns a full MAX_OPTIONS set.
    assert len(res.json()["options"]) == MAX_OPTIONS


def test_suggestions_rejects_bad_category(client):
    _auth(client, "g8@example.com")
    assert client.get("/api/v1/gratitude/suggestions?category=nope").status_code == 422

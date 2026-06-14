"""Tests for personalized daily quests: choosing which features to receive quests
for (POST /auth/quest-features) and how that shapes the dashboard quest list."""

from datetime import UTC, datetime

ENDPOINT = "/api/v1/auth/quest-features"


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _quest_keys(client):
    body = client.get("/api/v1/dashboard/stats").json()
    return [q["key"] for q in body["daily_quests"]]


def _quest_done(client):
    body = client.get("/api/v1/dashboard/stats").json()
    return {q["key"]: q["done"] for q in body["daily_quests"]}


def test_quest_features_requires_auth(client):
    res = client.post(ENDPOINT, json={"features": ["meditate", "breathe", "gratitude"]})
    assert res.status_code == 401


def test_new_user_defaults_to_all_four(client):
    _auth(client, "qf_default@example.com")
    # NULL until chosen → quest generation falls back to all four, in canonical order.
    assert _quest_keys(client) == ["meditate", "breathe", "gratitude", "journal"]
    # /me exposes the (still unset) selection so the client can show the picker.
    assert client.get("/api/v1/auth/me").json()["quest_features"] is None


def test_set_quest_features_narrows_the_list(client):
    _auth(client, "qf_set@example.com")
    res = client.post(ENDPOINT, json={"features": ["journal", "gratitude", "breathe"]})
    assert res.status_code == 200
    # Stored + returned in canonical order, regardless of input order.
    assert res.json()["quest_features"] == ["breathe", "gratitude", "journal"]
    # The dashboard now offers exactly those three, in canonical order.
    assert _quest_keys(client) == ["breathe", "gratitude", "journal"]


def test_set_quest_features_dedupes(client):
    _auth(client, "qf_dupe@example.com")
    res = client.post(
        ENDPOINT, json={"features": ["meditate", "meditate", "breathe", "gratitude"]}
    )
    assert res.status_code == 200
    assert res.json()["quest_features"] == ["meditate", "breathe", "gratitude"]


def test_fewer_than_three_rejected(client):
    _auth(client, "qf_few@example.com")
    res = client.post(ENDPOINT, json={"features": ["meditate", "breathe"]})
    assert res.status_code == 422


def test_unknown_feature_rejected(client):
    _auth(client, "qf_unknown@example.com")
    res = client.post(ENDPOINT, json={"features": ["meditate", "breathe", "goals"]})
    assert res.status_code == 422


def test_journal_quest_completes_on_a_journal_entry(client):
    _auth(client, "qf_journal@example.com")
    client.post(ENDPOINT, json={"features": ["meditate", "gratitude", "journal"]})

    assert _quest_done(client)["journal"] is False

    # A journal entry with a mood completes whichever journal variant is up today
    # ("write a journal entry" or "journal with a mood").
    client.post(
        "/api/v1/journals", json={"body": "A quiet, clear sit today.", "mood": "calm"}
    )
    assert _quest_done(client)["journal"] is True


def test_meditate_quest_ignores_breathing_sessions(client):
    _auth(client, "qf_meditate@example.com")
    client.post(ENDPOINT, json={"features": ["meditate", "breathe", "gratitude"]})
    today = datetime.now(UTC).date().isoformat()
    # A breathing session must not complete the (non-breathing) meditate quest. The
    # slow pace makes it satisfy every breathe variant, so breathe is done either way.
    client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing",
            "duration_seconds": 600,
            "occurred_at": f"{today}T08:00:00",
            "inhale_seconds": 5,
            "exhale_seconds": 7,
        },
    )
    done = _quest_done(client)
    assert done["meditate"] is False
    assert done["breathe"] is True

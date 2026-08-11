"""Tests for the AI reflection coach: routes, ownership, daily cap, idempotency,
and the LLM service's fallback/validation behavior.

The LLM call is patched at the service seam — we never call the real Anthropic API.
"""

import uuid
from unittest.mock import patch

from app.core.config import settings
from app.services import reflection_service
from app.services.ai import reflection_coach

# Where the business service resolves the LLM call.
GENERATE = "app.services.reflection_service.reflection_coach.generate"
AI_RESULT = (
    "You noticed a real shift toward calm today.",
    "What helped you settle, do you think?",
    reflection_coach.MODEL,
)


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _entry(client, body="Felt calmer after sitting today.") -> str:
    return client.post("/api/v1/journals", json={"body": body, "mood": "calm"}).json()["id"]


# ── Auth ─────────────────────────────────────────────────────────────────────


def test_create_requires_auth(client):
    res = client.post(f"/api/v1/journals/{uuid.uuid4()}/reflection")
    assert res.status_code == 401


def test_get_requires_auth(client):
    res = client.get(f"/api/v1/journals/{uuid.uuid4()}/reflection")
    assert res.status_code == 401


# ── Ownership / missing IDs (always 404 — never 403, no ID enumeration) ─────


def test_unknown_journal_404(client):
    _auth(client, "r404@example.com")
    with patch(GENERATE) as gen:
        res = client.post(f"/api/v1/journals/{uuid.uuid4()}/reflection")
    assert res.status_code == 404
    gen.assert_not_called()


def test_other_users_journal_404(client):
    _auth(client, "rowner@example.com")
    journal_id = _entry(client)
    _auth(client, "rintruder@example.com")
    with patch(GENERATE) as gen:
        assert client.post(f"/api/v1/journals/{journal_id}/reflection").status_code == 404
        assert client.get(f"/api/v1/journals/{journal_id}/reflection").status_code == 404
    gen.assert_not_called()


# ── Happy path ───────────────────────────────────────────────────────────────


def test_create_returns_reflection(client):
    _auth(client, "rhappy@example.com")
    journal_id = _entry(client)
    with patch(GENERATE, return_value=AI_RESULT) as gen:
        res = client.post(f"/api/v1/journals/{journal_id}/reflection")
    assert res.status_code == 201
    body = res.json()
    assert body["journal_id"] == journal_id
    assert body["reflection_text"] == AI_RESULT[0]
    assert body["followup_question"] == AI_RESULT[1]
    assert body["source"] == "ai"
    # The model sees the entry text and mood; the raw model id never reaches clients.
    gen.assert_called_once()
    assert "model" not in body
    assert reflection_coach.MODEL not in res.text


def test_fallback_result_reports_fallback_source(client):
    _auth(client, "rfall@example.com")
    journal_id = _entry(client)
    fallback = ("A gentle note.", "A gentle question?", reflection_coach.FALLBACK_MODEL)
    with patch(GENERATE, return_value=fallback):
        res = client.post(f"/api/v1/journals/{journal_id}/reflection")
    assert res.status_code == 201
    assert res.json()["source"] == "fallback"


def test_get_returns_existing(client):
    _auth(client, "rget@example.com")
    journal_id = _entry(client)
    with patch(GENERATE, return_value=AI_RESULT):
        created = client.post(f"/api/v1/journals/{journal_id}/reflection").json()
    got = client.get(f"/api/v1/journals/{journal_id}/reflection")
    assert got.status_code == 200
    assert got.json() == created


def test_get_404_when_no_reflection_yet(client):
    _auth(client, "rnone@example.com")
    journal_id = _entry(client)
    assert client.get(f"/api/v1/journals/{journal_id}/reflection").status_code == 404


# ── Idempotency ──────────────────────────────────────────────────────────────


def test_second_post_reuses_and_skips_llm(client):
    _auth(client, "ridem@example.com")
    journal_id = _entry(client)
    with patch(GENERATE, return_value=AI_RESULT) as gen:
        first = client.post(f"/api/v1/journals/{journal_id}/reflection")
        second = client.post(f"/api/v1/journals/{journal_id}/reflection")
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json() == first.json()
    gen.assert_called_once()  # the existing reflection is reused, not regenerated


# ── Daily cap ────────────────────────────────────────────────────────────────


def test_new_generations_capped_per_day(client, monkeypatch):
    monkeypatch.setattr(reflection_service, "REFLECTION_DAILY_LIMIT", 2)
    _auth(client, "rcap@example.com")
    ids = [_entry(client, body=f"reflection {i}") for i in range(3)]
    with patch(GENERATE, return_value=AI_RESULT):
        assert client.post(f"/api/v1/journals/{ids[0]}/reflection").status_code == 201
        assert client.post(f"/api/v1/journals/{ids[1]}/reflection").status_code == 201
        capped = client.post(f"/api/v1/journals/{ids[2]}/reflection")
        assert capped.status_code == 429
        # Re-reading an existing reflection is never counted against the cap.
        assert client.post(f"/api/v1/journals/{ids[0]}/reflection").status_code == 200


# ── The LLM service itself (no API key → curated fallback; output validation) ─


def test_generate_without_key_uses_fallback(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    reflection, followup, model = reflection_coach.generate("I sat for ten minutes.")
    assert model == reflection_coach.FALLBACK_MODEL
    assert (reflection, followup) in reflection_coach.FALLBACK_PAIRS


def test_validate_rejects_bad_shapes():
    assert reflection_coach._validate(["not", "a", "dict"]) is None
    assert reflection_coach._validate({"reflection": "only one field"}) is None
    assert reflection_coach._validate({"reflection": "", "followup": "q?"}) is None
    assert reflection_coach._validate({"reflection": "r", "followup": 42}) is None
    too_long = "x" * (reflection_coach.MAX_REFLECTION_LEN + 1)
    assert reflection_coach._validate({"reflection": too_long, "followup": "q?"}) is None


def test_validate_strips_and_accepts_good_output():
    out = reflection_coach._validate({"reflection": "  kind words  ", "followup": " q? "})
    assert out == ("kind words", "q?")


def test_fallback_pairs_are_sane():
    assert len(reflection_coach.FALLBACK_PAIRS) >= 10
    for reflection, followup in reflection_coach.FALLBACK_PAIRS:
        assert reflection.strip() and followup.strip()
        assert len(reflection) <= reflection_coach.MAX_REFLECTION_LEN
        assert len(followup) <= reflection_coach.MAX_FOLLOWUP_LEN

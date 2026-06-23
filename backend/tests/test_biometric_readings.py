"""Tests for biometric reading routes: create, list (trend window), user-scoping,
validation, session linkage, the pre/post delta, and the daily create cap."""

from datetime import UTC, datetime, timedelta

from app.core.config import settings


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _reading(client, **overrides):
    body = {
        "context": "resting",
        "bpm": 68,
        "measured_at": "2026-06-16T08:00:00Z",
    }
    body.update(overrides)
    return client.post("/api/v1/biometric-readings", json=body)


def _session(client, **overrides):
    body = {
        "type": "resonance_breathing",
        "duration_seconds": 600,
        "occurred_at": "2026-06-16T08:00:00Z",
    }
    body.update(overrides)
    return client.post("/api/v1/sessions", json=body)


def test_create_requires_auth(client):
    assert _reading(client).status_code == 401


def test_list_requires_auth(client):
    assert client.get("/api/v1/biometric-readings").status_code == 401


def test_create_and_list(client):
    _auth(client, "b1@example.com")
    assert _reading(client, bpm=72, hrv_ms=45.0).status_code == 201
    body = client.get("/api/v1/biometric-readings").json()
    assert len(body) == 1
    assert body[0]["bpm"] == 72
    assert body[0]["hrv_ms"] == 45.0
    assert body[0]["context"] == "resting"
    assert body[0]["source"] == "manual"
    assert "id" in body[0] and "created_at" in body[0]


def test_hrv_optional(client):
    _auth(client, "b2@example.com")
    assert _reading(client, bpm=60).status_code == 201
    assert client.get("/api/v1/biometric-readings").json()[0]["hrv_ms"] is None


def test_bpm_out_of_range_rejected(client):
    _auth(client, "b3@example.com")
    assert _reading(client, bpm=10).status_code == 422  # below 30
    assert _reading(client, bpm=300).status_code == 422  # above 220


def test_unknown_context_rejected(client):
    _auth(client, "b4@example.com")
    assert _reading(client, context="sideways").status_code == 422


def test_extra_field_rejected(client):
    _auth(client, "b5@example.com")
    assert _reading(client, smell="lavender").status_code == 422


def test_negative_hrv_rejected(client):
    _auth(client, "b6@example.com")
    assert _reading(client, hrv_ms=-5).status_code == 422


def test_hrv_over_physiological_max_rejected(client):
    _auth(client, "b6max@example.com")
    assert _reading(client, hrv_ms=1500).status_code == 422  # above 1000ms


def test_future_measured_at_rejected(client):
    _auth(client, "b-future@example.com")
    future = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    assert _reading(client, measured_at=future).status_code == 422


def test_far_past_measured_at_rejected(client):
    _auth(client, "b-past@example.com")
    far_past = (datetime.now(UTC) - timedelta(days=365 * 6)).isoformat()
    assert _reading(client, measured_at=far_past).status_code == 422


def test_recent_measured_at_accepted(client):
    _auth(client, "b-recent@example.com")
    now = datetime.now(UTC).isoformat()
    assert _reading(client, measured_at=now).status_code == 201


def test_client_token_makes_create_idempotent(client):
    _auth(client, "b-idem@example.com")
    first = _reading(client, client_token="rd-1")
    second = _reading(client, client_token="rd-1")
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["id"] == second.json()["id"]  # same row, not a duplicate
    assert len(client.get("/api/v1/biometric-readings").json()) == 1


def test_idempotent_post_reading_keeps_delta_deterministic(client):
    # A double-submitted post reading must not create a second row that could flip the
    # pre/post pairing — the delta stays the same regardless of submit count.
    _auth(client, "b-idem-delta@example.com")
    session_id = _session(client).json()["id"]
    _reading(client, context="pre", bpm=72, session_id=session_id)
    _reading(client, context="post", bpm=66, session_id=session_id, client_token="post-1")
    _reading(client, context="post", bpm=66, session_id=session_id, client_token="post-1")

    assert len(client.get("/api/v1/biometric-readings").json()) == 2  # pre + one post
    delta = client.get("/api/v1/biometric-readings/delta").json()
    assert delta["sample_size"] == 1
    assert delta["avg_bpm_delta"] == -6.0


def test_list_is_user_scoped(client):
    _auth(client, "owner-b@example.com")
    _reading(client)
    _auth(client, "other-b@example.com")  # different user
    assert client.get("/api/v1/biometric-readings").json() == []


def test_days_window_filters(client):
    _auth(client, "b7@example.com")
    # Use a relative recent date, not a fixed literal: the ?days=7 window is relative to
    # "now", so a hardcoded measured_at silently falls out of the window as time passes
    # (this test was a date time-bomb). A day ago is always inside a 7-day window.
    recent = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    _reading(client, measured_at=recent)
    assert len(client.get("/api/v1/biometric-readings?days=7").json()) == 1


def test_link_own_session(client):
    _auth(client, "b8@example.com")
    session_id = _session(client).json()["id"]
    res = _reading(client, context="post", session_id=session_id)
    assert res.status_code == 201
    assert res.json()["session_id"] == session_id


def test_link_foreign_session_is_404(client):
    _auth(client, "b9-owner@example.com")
    session_id = _session(client).json()["id"]
    _auth(client, "b9-intruder@example.com")  # different user
    assert _reading(client, session_id=session_id).status_code == 404


def test_link_session_backfills_session_id(client):
    # A pre reading captured before the sit existed is saved with no session, then
    # linked once the session is created — so the pre/post delta can pair them.
    _auth(client, "b-link@example.com")
    reading_id = _reading(client, context="pre", bpm=74).json()["id"]
    assert client.get("/api/v1/biometric-readings").json()[0]["session_id"] is None

    session_id = _session(client).json()["id"]
    res = client.patch(
        f"/api/v1/biometric-readings/{reading_id}/session",
        json={"session_id": session_id},
    )
    assert res.status_code == 200
    assert res.json()["session_id"] == session_id


def test_link_session_then_post_pairs_in_delta(client):
    # The end-to-end pre-link flow: pre saved standalone, linked after the sit, post
    # saved against the sit — the delta then sees a complete pair.
    _auth(client, "b-link-delta@example.com")
    reading_id = _reading(client, context="pre", bpm=74).json()["id"]
    session_id = _session(client).json()["id"]
    client.patch(
        f"/api/v1/biometric-readings/{reading_id}/session",
        json={"session_id": session_id},
    )
    _reading(client, context="post", bpm=66, session_id=session_id)

    delta = client.get("/api/v1/biometric-readings/delta").json()
    assert delta["sample_size"] == 1
    assert delta["avg_bpm_delta"] == -8.0


def test_link_requires_auth(client):
    assert (
        client.patch(
            "/api/v1/biometric-readings/00000000-0000-0000-0000-000000000000/session",
            json={"session_id": "00000000-0000-0000-0000-000000000000"},
        ).status_code
        == 401
    )


def test_link_unknown_reading_is_404(client):
    _auth(client, "b-link-404@example.com")
    session_id = _session(client).json()["id"]
    res = client.patch(
        "/api/v1/biometric-readings/00000000-0000-0000-0000-000000000000/session",
        json={"session_id": session_id},
    )
    assert res.status_code == 404


def test_link_to_foreign_session_is_404(client):
    _auth(client, "b-link-owner@example.com")
    reading_id = _reading(client, context="pre").json()["id"]
    _auth(client, "b-link-intruder@example.com")  # different user owns this session
    session_id = _session(client).json()["id"]
    _auth(client, "b-link-owner@example.com")  # back to the reading's owner
    res = client.patch(
        f"/api/v1/biometric-readings/{reading_id}/session",
        json={"session_id": session_id},
    )
    assert res.status_code == 404


def test_link_other_users_reading_is_404(client):
    _auth(client, "b-link-r-owner@example.com")
    reading_id = _reading(client, context="pre").json()["id"]
    _auth(client, "b-link-r-intruder@example.com")  # different user
    session_id = _session(client).json()["id"]
    res = client.patch(
        f"/api/v1/biometric-readings/{reading_id}/session",
        json={"session_id": session_id},
    )
    assert res.status_code == 404


def test_link_extra_field_rejected(client):
    _auth(client, "b-link-extra@example.com")
    reading_id = _reading(client, context="pre").json()["id"]
    session_id = _session(client).json()["id"]
    res = client.patch(
        f"/api/v1/biometric-readings/{reading_id}/session",
        json={"session_id": session_id, "smell": "lavender"},
    )
    assert res.status_code == 422


def test_delete_own_and_404_for_others(client):
    _auth(client, "del-b@example.com")
    reading_id = _reading(client).json()["id"]
    assert client.delete(f"/api/v1/biometric-readings/{reading_id}").status_code == 204
    assert client.get("/api/v1/biometric-readings").json() == []

    _auth(client, "intruder-b@example.com")
    other_id = _reading(client).json()["id"]
    _auth(client, "del-b@example.com")  # back to the first user
    assert client.delete(f"/api/v1/biometric-readings/{other_id}").status_code == 404


def test_pre_post_delta(client):
    _auth(client, "delta@example.com")
    session_id = _session(client).json()["id"]
    _reading(client, context="pre", bpm=72, hrv_ms=40.0, session_id=session_id)
    _reading(client, context="post", bpm=66, hrv_ms=52.0, session_id=session_id)

    delta = client.get("/api/v1/biometric-readings/delta").json()
    assert delta["sample_size"] == 1
    assert delta["avg_bpm_delta"] == -6.0  # settled 6 bpm
    assert delta["avg_hrv_ms_delta"] == 12.0


def test_delta_empty_when_no_pairs(client):
    _auth(client, "delta-empty@example.com")
    _reading(client, context="resting")  # standalone, no pairing
    delta = client.get("/api/v1/biometric-readings/delta").json()
    assert delta["sample_size"] == 0
    assert delta["avg_bpm_delta"] is None


def test_delta_is_user_scoped(client):
    _auth(client, "delta-owner@example.com")
    session_id = _session(client).json()["id"]
    _reading(client, context="pre", bpm=70, session_id=session_id)
    _reading(client, context="post", bpm=64, session_id=session_id)
    _auth(client, "delta-other@example.com")
    assert client.get("/api/v1/biometric-readings/delta").json()["sample_size"] == 0


def test_daily_create_cap(client, monkeypatch):
    monkeypatch.setattr(settings, "daily_create_limit", 2)
    _auth(client, "cap-b@example.com")
    assert _reading(client).status_code == 201
    assert _reading(client).status_code == 201
    assert _reading(client).status_code == 429  # over the per-day cap


def test_delta_distinct_sample_sizes(client):
    """A dataset where some sessions lack HRV readings must report separate sizes.

    Two sessions: both have BPM readings (sample_size=2), but only one has HRV on
    both ends (hrv_sample_size=1). Before the fix both used len(bpm_deltas) which
    would mis-label the HRV figure.
    """
    _auth(client, "split-delta@example.com")
    # Session 1: BPM + HRV on both sides.
    s1 = _session(client).json()["id"]
    _reading(client, context="pre", bpm=72, hrv_ms=40.0, session_id=s1)
    _reading(client, context="post", bpm=66, hrv_ms=52.0, session_id=s1)
    # Session 2: BPM only (no HRV readings).
    s2 = _session(client, occurred_at="2026-06-16T09:00:00Z").json()["id"]
    _reading(client, context="pre", bpm=80, measured_at="2026-06-16T09:00:00Z", session_id=s2)
    _reading(client, context="post", bpm=76, measured_at="2026-06-16T09:05:00Z", session_id=s2)

    delta = client.get("/api/v1/biometric-readings/delta").json()
    assert delta["sample_size"] == 2       # both sessions have BPM pairs
    assert delta["hrv_sample_size"] == 1   # only the first has HRV pairs
    assert delta["avg_hrv_ms_delta"] == 12.0  # correct: (52 - 40) / 1


def test_delta_includes_hrv_sample_size_field(client):
    """The delta response always includes hrv_sample_size (even when 0)."""
    _auth(client, "delta-field@example.com")
    delta = client.get("/api/v1/biometric-readings/delta").json()
    assert "hrv_sample_size" in delta
    assert delta["hrv_sample_size"] == 0

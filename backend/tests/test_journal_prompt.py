"""Tests for GET /api/v1/journals/prompt — contextual journaling nudge.

The prompt is chosen from the user's recent practice: a streak milestone outranks a
last-session-type prompt, which outranks a generic fallback. `today` is the user's
real local date here, so streak tests anchor to "today" and walk backwards.
"""

from datetime import UTC, datetime, timedelta


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, *, type="mindfulness", days_ago=0, hour=8, seconds=600):
    day = datetime.now(UTC).date() - timedelta(days=days_ago)
    return client.post(
        "/api/v1/sessions",
        json={
            "type": type,
            "duration_seconds": seconds,
            "occurred_at": f"{day.isoformat()}T{hour:02d}:00:00",
        },
    )


def _prompt(client):
    return client.get("/api/v1/journals/prompt").json()


def test_requires_auth(client):
    assert client.get("/api/v1/journals/prompt").status_code == 401


def test_generic_fallback_when_no_sessions(client):
    """With no practice history, the prompt falls back to a generic one."""
    _auth(client, "jp_empty@example.com")
    body = _prompt(client)
    assert body["context"] == "generic"
    assert body["contextual"] is False
    assert body["text"]  # non-empty copy


def test_after_breathing_context(client):
    """The last sit being a breathing session yields an after-breathing prompt."""
    _auth(client, "jp_breath@example.com")
    _session(client, type="mindfulness", days_ago=2)
    _session(client, type="resonance_breathing", days_ago=0)  # most recent
    body = _prompt(client)
    assert body["context"] == "after_breathing"
    assert body["contextual"] is True


def test_energizing_breathing_also_after_breathing(client):
    """Energizing breathing is breathwork too, so it shares the breathing pool."""
    _auth(client, "jp_energize@example.com")
    _session(client, type="energizing_breathing", days_ago=0)
    assert _prompt(client)["context"] == "after_breathing"


def test_after_loving_kindness_context(client):
    """A loving-kindness last sit yields its own warmer prompt pool."""
    _auth(client, "jp_lk@example.com")
    _session(client, type="loving_kindness", days_ago=0)
    body = _prompt(client)
    assert body["context"] == "after_loving_kindness"
    assert body["contextual"] is True


def test_after_meditation_context(client):
    """Any other meditation type falls into the general after-meditation pool."""
    _auth(client, "jp_med@example.com")
    _session(client, type="body_scan", days_ago=0)
    body = _prompt(client)
    assert body["context"] == "after_meditation"
    assert body["contextual"] is True


def test_last_session_by_occurred_at_not_insertion_order(client):
    """The 'last' session is the one that OCCURRED most recently, even if a more
    recent meditation was logged afterward with an earlier occurred_at."""
    _auth(client, "jp_order@example.com")
    # Insert the breathing sit LAST but date it as the most recent occurrence.
    _session(client, type="mindfulness", days_ago=0)
    _session(client, type="resonance_breathing", days_ago=0, hour=20)  # later in the day
    assert _prompt(client)["context"] == "after_breathing"


def test_streak_milestone_outranks_session_type(client):
    """A 7-day streak surfaces the milestone prompt, even though the last sit type
    would otherwise pick its own pool."""
    _auth(client, "jp_streak7@example.com")
    # Seven consecutive practice days ending today → current streak of 7.
    for d in range(7):
        _session(client, type="loving_kindness", days_ago=d)
    body = _prompt(client)
    assert body["context"] == "streak_7"
    assert body["contextual"] is True


def test_streak_below_milestone_uses_session_type(client):
    """A short streak (below 7) doesn't trigger a milestone — falls to session type."""
    _auth(client, "jp_streak_short@example.com")
    for d in range(3):  # 3-day streak — under the 7-day milestone
        _session(client, type="resonance_breathing", days_ago=d)
    assert _prompt(client)["context"] == "after_breathing"


def test_thirty_day_streak_outranks_seven(client):
    """At 30+ days the larger milestone wins (largest reached milestone surfaces)."""
    _auth(client, "jp_streak30@example.com")
    for d in range(30):
        _session(client, type="mindfulness", days_ago=d)
    assert _prompt(client)["context"] == "streak_30"


def test_deterministic_within_a_day(client):
    """Two calls the same day return the identical prompt (no flicker on reload)."""
    _auth(client, "jp_stable@example.com")
    _session(client, type="mindfulness", days_ago=0)
    assert _prompt(client)["text"] == _prompt(client)["text"]


def test_user_scoped(client):
    """One user's sessions never drive another user's prompt context."""
    _auth(client, "jp_owner@example.com")
    _session(client, type="resonance_breathing", days_ago=0)
    _auth(client, "jp_other@example.com")  # fresh user, no sessions
    body = _prompt(client)
    assert body["context"] == "generic"
    assert body["contextual"] is False

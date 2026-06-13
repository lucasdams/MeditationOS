"""Tests for the dashboard routes: /stats (totals + weekly) and /activity."""

from datetime import UTC, datetime


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _session(client, occurred_at, seconds=600, type="mindfulness"):
    return client.post(
        "/api/v1/sessions",
        json={"type": type, "duration_seconds": seconds, "occurred_at": occurred_at},
    )


def test_stats_requires_auth(client):
    assert client.get("/api/v1/dashboard/stats").status_code == 401


def test_stats_empty(client):
    _auth(client, "empty@example.com")
    body = client.get("/api/v1/dashboard/stats").json()
    assert body["total_seconds"] == 0
    assert body["session_count"] == 0
    assert len(body["this_week"]) == 7
    assert all(d["seconds"] == 0 for d in body["this_week"])


def test_stats_totals(client):
    _auth(client, "totals@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=600)
    _session(client, "2026-01-02T08:00:00", seconds=900)
    body = client.get("/api/v1/dashboard/stats").json()
    assert body["total_seconds"] == 1500
    assert body["session_count"] == 2


def test_stats_weekly_includes_today(client):
    _auth(client, "weekly@example.com")
    today = datetime.now(UTC).date()
    _session(client, f"{today.isoformat()}T08:00:00", seconds=1200)
    body = client.get("/api/v1/dashboard/stats").json()
    last = body["this_week"][-1]
    assert last["date"] == today.isoformat()
    assert last["seconds"] == 1200


def test_stats_user_scoped(client):
    _auth(client, "owner@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=600)
    _auth(client, "other@example.com")  # different user
    body = client.get("/api/v1/dashboard/stats").json()
    assert body["total_seconds"] == 0
    assert body["session_count"] == 0


def test_activity_requires_auth(client):
    assert client.get("/api/v1/dashboard/activity").status_code == 401


def test_activity_sparse_and_summed_per_day(client):
    _auth(client, "activity@example.com")
    today = datetime.now(UTC).date()
    _session(client, f"{today.isoformat()}T08:00:00", seconds=600)
    _session(client, f"{today.isoformat()}T17:00:00", seconds=300)  # same day → summed
    body = client.get("/api/v1/dashboard/activity").json()
    assert body["end"] == today.isoformat()
    assert len(body["days"]) == 1  # sparse: only the one active day
    # Session-only day: active, but not all quests (no gratitude, no full-minute breathing).
    assert body["days"][0] == {"date": today.isoformat(), "seconds": 900, "all_quests": False}


def test_activity_user_scoped(client):
    _auth(client, "act_owner@example.com")
    _session(client, "2026-01-01T08:00:00", seconds=600)
    _auth(client, "act_other@example.com")  # different user
    body = client.get("/api/v1/dashboard/activity").json()
    assert body["days"] == []


def test_stats_breathing_earns_triple_xp(client):
    _auth(client, "breathe_xp@example.com")
    today = datetime.now(UTC).date()
    # 10 min meditation = 20 XP (2/min); 10 min resonance breathing = 30 XP (3/min).
    _session(client, f"{today.isoformat()}T08:00:00", seconds=600, type="mindfulness")
    _session(
        client, f"{today.isoformat()}T09:00:00", seconds=600, type="resonance_breathing"
    )
    body = client.get("/api/v1/dashboard/stats").json()
    # meditation (20) + breathing (30) + meditate & breathe quest bonuses (30)
    # + 1-day streak bonus (10) = 90.
    assert body["xp"] == 90


def test_stats_gratitude_adds_xp(client):
    _auth(client, "grat_xp@example.com")
    base = client.get("/api/v1/dashboard/stats").json()
    assert base["xp"] == 0
    assert base["gratitude_count"] == 0
    client.post("/api/v1/gratitude", json={"category": "self", "text": "I showed up today"})
    after = client.get("/api/v1/dashboard/stats").json()
    assert after["gratitude_count"] == 1
    # 5 (gratitude) + 15 (gratitude quest) = 20.
    assert after["xp"] == 20


def test_stats_journal_adds_xp(client):
    _auth(client, "journal_xp@example.com")
    client.post("/api/v1/journals", json={"body": "A clear, quiet sit."})
    body = client.get("/api/v1/dashboard/stats").json()
    # 5 (journal entry) + 15 (journal quest bonus) = 20.
    assert body["xp"] == 20


def test_meditation_earns_two_xp_per_minute(client):
    _auth(client, "med_rate@example.com")
    # Back-dated (January) so no current-streak bonus muddies the arithmetic.
    _session(client, "2026-01-01T08:00:00", seconds=600, type="mindfulness")
    body = client.get("/api/v1/dashboard/stats").json()
    # 10 min × 2 = 20 practice + 15 (meditate quest bonus) = 35.
    assert body["xp"] == 35


def test_daily_quests_track_today(client):
    _auth(client, "quests@example.com")
    today = datetime.now(UTC).date()

    before = client.get("/api/v1/dashboard/stats").json()
    # New accounts default to all four daily-activity quests.
    assert {q["key"] for q in before["daily_quests"]} == {
        "meditate",
        "breathe",
        "gratitude",
        "journal",
    }
    assert all(q["done"] is False for q in before["daily_quests"])

    # A 10-minute breathing session completes only the breathe quest — breathing is
    # not a meditation session.
    _session(
        client, f"{today.isoformat()}T08:00:00", seconds=600, type="resonance_breathing"
    )
    after = client.get("/api/v1/dashboard/stats").json()
    done = {q["key"]: q["done"] for q in after["daily_quests"]}
    assert done == {
        "meditate": False,
        "breathe": True,
        "gratitude": False,
        "journal": False,
    }
    assert after["streak_bonus_xp"] == 10  # longest streak 1 day × 10
    # 30 (breathing) + 15 (breathe quest bonus) + 10 (streak) = 55. Breathing no
    # longer double-counts as a generic session.
    assert after["xp"] == 55


def test_breathe_quest_needs_a_full_minute(client):
    _auth(client, "shortbreath@example.com")
    today = datetime.now(UTC).date()
    _session(
        client, f"{today.isoformat()}T08:00:00", seconds=30, type="resonance_breathing"
    )
    _session(client, f"{today.isoformat()}T09:00:00", seconds=600, type="mindfulness")
    body = client.get("/api/v1/dashboard/stats").json()
    quests = {q["key"]: q["done"] for q in body["daily_quests"]}
    assert quests["breathe"] is False  # only 30s < 60s threshold
    assert quests["meditate"] is True  # the mindfulness session counts


def test_activity_all_quests_flag(client):
    _auth(client, "perfectday@example.com")
    today = datetime.now(UTC).date().isoformat()
    _session(client, f"{today}T08:00:00", seconds=600)  # session quest
    _session(client, f"{today}T09:00:00", seconds=120, type="resonance_breathing")  # breathe
    client.post("/api/v1/gratitude", json={"category": "people", "text": "a friend"})  # gratitude
    days = client.get("/api/v1/dashboard/activity").json()["days"]
    day = next(d for d in days if d["date"] == today)
    assert day["all_quests"] is True


def test_activity_partial_quests_not_flagged(client):
    _auth(client, "partialday@example.com")
    today = datetime.now(UTC).date().isoformat()
    _session(client, f"{today}T08:00:00", seconds=600)  # only a session — not all quests
    days = client.get("/api/v1/dashboard/activity").json()["days"]
    day = next(d for d in days if d["date"] == today)
    assert day["all_quests"] is False

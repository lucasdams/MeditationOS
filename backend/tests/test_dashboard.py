"""Tests for the dashboard routes: /stats (totals + weekly) and /activity."""

from datetime import UTC, date, datetime, timedelta

from app.services.quest_pool import quest_for


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


def test_activity_days_param_narrows_window(client):
    _auth(client, "act_days@example.com")
    today = datetime.now(UTC).date()
    old = today - timedelta(days=40)
    _session(client, f"{today.isoformat()}T08:00:00", seconds=600)
    _session(client, f"{old.isoformat()}T08:00:00", seconds=600)

    # Default window (a year) spans both active days.
    full = client.get("/api/v1/dashboard/activity").json()
    assert {d["date"] for d in full["days"]} == {today.isoformat(), old.isoformat()}

    # A 35-day window starts 34 days before today and excludes the 40-day-old day.
    recent = client.get("/api/v1/dashboard/activity?days=35").json()
    assert recent["start"] == (today - timedelta(days=34)).isoformat()
    assert recent["end"] == today.isoformat()
    assert [d["date"] for d in recent["days"]] == [today.isoformat()]


def test_activity_days_param_out_of_range_rejected(client):
    _auth(client, "act_days_bad@example.com")
    assert client.get("/api/v1/dashboard/activity?days=0").status_code == 422
    assert client.get("/api/v1/dashboard/activity?days=400").status_code == 422


def test_stats_breathing_earns_triple_xp(client):
    _auth(client, "breathe_xp@example.com")
    today = datetime.now(UTC).date()
    # 10 min meditation = 20 XP (2/min); 10 min resonance breathing = 30 XP (3/min).
    _session(client, f"{today.isoformat()}T08:00:00", seconds=600, type="mindfulness")
    _session(
        client, f"{today.isoformat()}T09:00:00", seconds=600, type="resonance_breathing"
    )
    body = client.get("/api/v1/dashboard/stats").json()
    # Practice (20 + 30) + whatever of today's rotating quests this activity completed
    # (their XP varies by variant) + the 1-day streak bonus.
    quest_xp = sum(q["xp"] for q in body["daily_quests"] if q["done"])
    assert body["streak_bonus_xp"] == 10
    assert body["xp"] == 20 + 30 + quest_xp + 10


def test_stats_gratitude_adds_xp(client):
    _auth(client, "grat_xp@example.com")
    base = client.get("/api/v1/dashboard/stats").json()
    assert base["xp"] == 0
    assert base["gratitude_count"] == 0
    client.post("/api/v1/gratitude", json={"category": "self", "text": "I showed up today"})
    after = client.get("/api/v1/dashboard/stats").json()
    assert after["gratitude_count"] == 1
    # 5 (the gratitude entry) + today's gratitude quest XP if this one entry completed
    # it (the base "write a gratitude" variant is done by one; "write three" is not).
    gq = next(q for q in after["daily_quests"] if q["key"] == "gratitude")
    assert after["xp"] == 5 + (gq["xp"] if gq["done"] else 0)


def test_stats_journal_adds_xp(client):
    _auth(client, "journal_xp@example.com")
    client.post("/api/v1/journals", json={"body": "A clear, quiet sit.", "mood": "calm"})
    body = client.get("/api/v1/dashboard/stats").json()
    # 5 (the journal entry) + today's journal quest XP. The entry carries a mood, so it
    # completes whichever variant is up ("write a journal entry" or "journal with a mood").
    jq = next(q for q in body["daily_quests"] if q["key"] == "journal")
    assert jq["done"] is True
    assert body["xp"] == 5 + jq["xp"]


def test_meditation_earns_two_xp_per_minute(client):
    _auth(client, "med_rate@example.com")
    # Back-dated (January) so no current-streak bonus muddies the arithmetic. The
    # quest that day is fixed by the date, so the expected XP is fully deterministic.
    _session(client, "2026-01-01T08:00:00", seconds=600, type="mindfulness")
    body = client.get("/api/v1/dashboard/stats").json()
    # 10 min × 2 = 20 practice + that day's meditate quest. A single 10-min session
    # completes "meditate"/"sit 10+ min" but not "meditate twice".
    quest = quest_for("meditate", date(2026, 1, 1))
    quest_done = quest.variant != "double_sit"
    assert body["xp"] == 20 + (quest.xp if quest_done else 0)


def test_daily_quests_track_today(client):
    _auth(client, "quests@example.com")
    today = datetime.now(UTC).date()

    # Pin the opt-in to three categories so the daily cap (max three surfaced) shows
    # exactly these every day, regardless of the date's rotation.
    client.post(
        "/api/v1/auth/quest-features",
        json={"features": ["meditate", "breathe", "gratitude"]},
    )
    before = client.get("/api/v1/dashboard/stats").json()
    assert {q["key"] for q in before["daily_quests"]} == {
        "meditate",
        "breathe",
        "gratitude",
    }
    assert all(q["done"] is False for q in before["daily_quests"])

    # A 10-minute slow breathing session completes only the breathe quest — breathing
    # is not a meditation session. inhale/exhale make it satisfy every breathe variant
    # (base / 5+ min / ≤5 bpm), so the assertion holds whichever one is up today.
    client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing",
            "duration_seconds": 600,
            "occurred_at": f"{today.isoformat()}T08:00:00",
            "inhale_seconds": 5,
            "exhale_seconds": 7,
        },
    )
    after = client.get("/api/v1/dashboard/stats").json()
    done = {q["key"]: q["done"] for q in after["daily_quests"]}
    assert done == {
        "meditate": False,
        "breathe": True,
        "gratitude": False,
    }
    assert after["streak_bonus_xp"] == 10  # current streak 1 day × 10
    # 30 (breathing) + today's breathe quest XP + 10 (streak). Breathing no longer
    # double-counts as a generic session.
    bq = next(q for q in after["daily_quests"] if q["key"] == "breathe")
    assert after["xp"] == 30 + bq["xp"] + 10


def test_breathe_quest_tracks_breathing_and_meditation(client):
    _auth(client, "shortbreath@example.com")
    # Pin to three categories (incl. breathe + meditate) so both surface every day
    # despite the daily cap's rotation.
    client.post(
        "/api/v1/auth/quest-features",
        json={"features": ["meditate", "breathe", "gratitude"]},
    )
    today = datetime.now(UTC).date()
    # Only 30s of breathing — below every breathe variant's bar (base 60s, deep 5 min,
    # slow ≤5 bpm) — plus two full meditation sessions so the meditate quest is met
    # whichever variant is up ("meditate" / "sit 10+ min" / "meditate twice").
    _session(
        client, f"{today.isoformat()}T08:00:00", seconds=30, type="resonance_breathing"
    )
    _session(client, f"{today.isoformat()}T09:00:00", seconds=600, type="mindfulness")
    _session(client, f"{today.isoformat()}T10:00:00", seconds=600, type="mindfulness")
    body = client.get("/api/v1/dashboard/stats").json()
    quests = {q["key"]: q["done"] for q in body["daily_quests"]}
    assert quests["breathe"] is False  # 30s isn't enough for any breathe variant
    assert quests["meditate"] is True  # two full meditation sessions count
    # A proper slow breathing session satisfies every breathe variant → quest completes.
    client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing",
            "duration_seconds": 600,
            "occurred_at": f"{today.isoformat()}T08:05:00",
            "inhale_seconds": 5,
            "exhale_seconds": 7,
        },
    )
    after = client.get("/api/v1/dashboard/stats").json()
    after_quests = {q["key"]: q["done"] for q in after["daily_quests"]}
    assert after_quests["breathe"] is True


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

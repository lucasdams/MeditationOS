"""Tests for the dashboard routes: /stats (totals + weekly) and /activity."""

from datetime import UTC, date, datetime, timedelta

from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import Session as PracticeSession
from app.models.user import User
from app.services import dashboard_service
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
    # Pin meditate + breathe so both surface (the daily cap can otherwise drop one from
    # the shown set while it still earns XP, which would skew the assertion by date).
    client.post(
        "/api/v1/auth/quest-features",
        json={"features": ["meditate", "breathe", "gratitude"]},
    )
    today = datetime.now(UTC).date()
    # 10 min meditation = 20 XP (2/min); 10 min resonance breathing = 30 XP (3/min).
    _session(client, f"{today.isoformat()}T08:00:00", seconds=600, type="mindfulness")
    _session(
        client, f"{today.isoformat()}T09:00:00", seconds=600, type="resonance_breathing"
    )
    body = client.get("/api/v1/dashboard/stats").json()
    # Practice (20 + 30) + the meditate & breathe quests done today (only those two
    # categories were practiced; their XP varies by variant) + the 1-day streak bonus.
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
    # 5 (the gratitude entry) + today's gratitude quest XP if this one entry completes it.
    # The bonus is paid for the completed condition whether or not the gratitude quest is
    # in today's surfaced rotation, so derive it from the pool: the base "Write a gratitude"
    # variant is done by one entry; "Write three gratitudes" is not.
    quest = quest_for("gratitude", datetime.now(UTC).date())
    done = quest.variant != "gratitude_three"
    assert after["xp"] == 5 + (quest.xp if done else 0)


def test_stats_journal_adds_xp(client):
    _auth(client, "journal_xp@example.com")
    client.post("/api/v1/journals", json={"body": "A clear, quiet sit.", "mood": "calm"})
    body = client.get("/api/v1/dashboard/stats").json()
    # 5 (the journal entry) + today's journal quest XP. The journal quest is only surfaced
    # on days the rotation picks it; when it is, the mood-carrying entry completes whichever
    # variant is up ("write a journal entry" or "journal with a mood"). When it isn't
    # surfaced, no quest XP applies and only the entry's 5 XP counts.
    # 5 (the journal entry) + today's journal quest XP. Both journal variants ("Write a
    # journal entry" and "Journal with a mood") are completed by this one mood-carrying
    # entry, and the bonus is paid for the completed condition whether or not the journal
    # quest is in today's surfaced rotation — so derive the amount from the pool, not the
    # surfaced `daily_quests` list. (Journal/gratitude entries don't start a streak, so no
    # streak bonus to account for here.)
    quest = quest_for("journal", datetime.now(UTC).date())
    assert body["xp"] == 5 + quest.xp


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


# --- wallet basis ↔ dashboard parity ----------------------------------------
# get_wallet_basis is the lightweight path the sanctuary wallet reads; it must return
# the SAME earned XP, earned-XP level, and current streak that the full dashboard
# (get_stats) computes, across many session shapes — otherwise coins would drift.


def _seed_varied_history(db_session, user_id, *, base: date):
    """A messy-but-realistic history: a multi-day streak, breathing + meditation of
    several lengths, multiple sessions per day, sub-minute sits, plus gratitude and
    journal entries — exercising every XP term the wallet depends on."""
    def at(d, hour=8, minute=0):
        return datetime(d.year, d.month, d.day, hour, minute, tzinfo=UTC)

    rows = [
        # A 5-day consecutive streak ending on `base` (drives streak + streak bonus).
        (base - timedelta(days=4), 600, "mindfulness", None, None),
        (base - timedelta(days=3), 1800, "mindfulness", None, None),       # long sit
        (base - timedelta(days=2), 120, "resonance_breathing", 5, 7),      # slow breathe
        (base - timedelta(days=1), 4000, "mindfulness", None, None),       # past tier 3
        (base, 600, "mindfulness", None, None),
        (base, 600, "mindfulness", None, None),                            # double sit
        (base, 360, "resonance_breathing", 6, 6),                          # deep breathe
        (base, 30, "mindfulness", None, None),                             # sub-minute → 0 XP
    ]
    for d, secs, type_, inhale, exhale in rows:
        db_session.add(
            PracticeSession(
                user_id=user_id,
                type=type_,
                duration_seconds=secs,
                occurred_at=at(d),
                inhale_seconds=inhale,
                exhale_seconds=exhale,
            )
        )
    # Gratitude: more than the daily cap on one day (anti-farm), one on another.
    for i in range(7):
        db_session.add(
            GratitudeEntry(
                user_id=user_id, category="people", text=f"g{i}",
                created_at=datetime(base.year, base.month, base.day, 9, i, tzinfo=UTC),
            )
        )
    db_session.add(
        GratitudeEntry(
            user_id=user_id, category="people", text="earlier",
            created_at=at(base - timedelta(days=2), 10),
        )
    )
    # Journals: one with a mood, one without, both same day.
    db_session.add(
        Journal(
            user_id=user_id, body="reflected", mood="calm",
            created_at=at(base - timedelta(days=1), 21),
        )
    )
    db_session.add(
        Journal(
            user_id=user_id, body="more",
            created_at=at(base - timedelta(days=1), 22),
        )
    )
    db_session.commit()


def test_get_wallet_basis_matches_get_stats(db_session):
    user = User(email="walletparity@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    base = date(2026, 6, 16)
    _seed_varied_history(db_session, user.id, base=base)

    # Check across multiple "today"s and timezones — the day rollover shifts which days
    # count, so this exercises many distinct XP/streak shapes from one seeded history.
    cases = [
        (base, "UTC"),
        (base, "Asia/Tokyo"),
        (base, "America/Los_Angeles"),
        (base + timedelta(days=1), "UTC"),   # streak lapses → streak bonus drops, coins don't
        (base + timedelta(days=3), "UTC"),   # well after the streak ended
    ]
    for today, tz in cases:
        stats = dashboard_service.get_stats(db_session, user.id, today=today, tz=tz)
        wallet = dashboard_service.get_wallet_basis(db_session, user.id, today=today, tz=tz)

        expected_earned = stats.xp - stats.streak_bonus_xp
        expected_level, _, _ = dashboard_service._level_progress(expected_earned)
        assert wallet.earned_xp == expected_earned, (today, tz)
        assert wallet.level == expected_level, (today, tz)
        assert wallet.current_streak == stats.current_streak_days, (today, tz)


def test_get_wallet_basis_empty_user(db_session):
    user = User(email="walletempty@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    wallet = dashboard_service.get_wallet_basis(
        db_session, user.id, today=date(2026, 6, 16), tz="UTC"
    )
    assert wallet.earned_xp == 0
    assert wallet.level == 1  # _level_progress(0) → level 1
    assert wallet.current_streak == 0


def test_sub_minute_slow_breath_pays_quest_bonus(db_session):
    # A single 50-second slow-breath day: under MIN_PRACTICE_SECONDS (60s), so the day
    # is NOT in session_days and earns 0 practice XP — but it DOES satisfy the
    # slow_breathe quest condition (one full breath ≥ SLOW_BREATH_SECONDS). On
    # 2026-06-16 the breathe category's rotating quest is `slow_breathe` (35 XP).
    # Regression: the quest-bonus loop must still visit this day and pay the bonus.
    user = User(email="subminute_quest@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    today = date(2026, 6, 16)
    db_session.add(
        PracticeSession(
            user_id=user.id,
            type="resonance_breathing",
            duration_seconds=50,  # < 60s: not a "practice day", 0 practice XP
            occurred_at=datetime(today.year, today.month, today.day, 8, 0, tzinfo=UTC),
            inhale_seconds=6,
            exhale_seconds=6,  # 12s/breath = 5 bpm → satisfies slow_breathe
        )
    )
    db_session.commit()

    quest = quest_for("breathe", today)
    assert quest.variant == "slow_breathe"  # guards the fixture's date assumption

    stats = dashboard_service.get_stats(
        db_session, user.id, today=today, tz="UTC",
        quest_features=["meditate", "breathe", "gratitude"],
    )
    breathe_q = next(q for q in stats.daily_quests if q.key == "breathe")
    assert breathe_q.done is True  # the sub-60s slow breath completes the quest
    # The day earns no practice XP (sub-minute) and there's no streak today-only bonus
    # beyond the 1-day streak... wait: a sub-60s day is NOT a practice day, so there is
    # NO current streak. Total XP is therefore exactly the slow_breathe bonus.
    assert stats.current_streak_days == 0
    assert stats.streak_bonus_xp == 0
    assert stats.xp == quest.xp  # 35 — the bonus is now paid (was 0 before the fix)

    # Wallet parity: get_wallet_basis shares _xp_basis, so earned XP matches and the
    # bonus isn't double-counted.
    wallet = dashboard_service.get_wallet_basis(db_session, user.id, today=today, tz="UTC")
    assert wallet.earned_xp == quest.xp  # earned XP == total here (no streak bonus)

"""The rotating daily-quest pool: deterministic rotation, varied XP, and that each
challenge variant is surfaced and completed correctly through the dashboard.

The dashboard derives "today" from the user's clock, so to pin a specific variant we
drive the service directly with a fixed `today` (the rotation is pure and date-keyed).
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.models.gratitude import GratitudeEntry
from app.models.user import User
from app.services import dashboard_service
from app.services.quest_pool import QUEST_POOL, quest_for


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _user_id(db_session, email):
    return db_session.execute(select(User.id).where(User.email == email)).scalar_one()


def _date_for(category: str, variant: str) -> date:
    """Find a date whose rotating quest for `category` is `variant`."""
    base = date(2026, 1, 1)
    for i in range(len(QUEST_POOL[category])):
        d = base + timedelta(days=i)
        if quest_for(category, d).variant == variant:
            return d
    raise AssertionError(f"no date surfaces {category}/{variant}")


def _quest(db_session, user_id, day, key):
    stats = dashboard_service.get_stats(
        db_session, user_id, today=day, tz="UTC", quest_features=None
    )
    return next(q for q in stats.daily_quests if q.key == key)


# --- pure rotation / XP -----------------------------------------------------

def test_quest_for_is_deterministic_and_rotates():
    day = date(2026, 6, 14)
    for category, pool in QUEST_POOL.items():
        assert quest_for(category, day) is quest_for(category, day)  # stable within a day
        seen = {quest_for(category, day + timedelta(days=i)).variant for i in range(len(pool))}
        assert seen == {q.variant for q in pool}  # a full cycle covers every variant
        assert (
            quest_for(category, day).variant
            == quest_for(category, day + timedelta(days=len(pool))).variant
        )  # wraps after one period


def test_quests_have_varied_xp():
    all_xp = [q.xp for pool in QUEST_POOL.values() for q in pool]
    assert len(set(all_xp)) > 1  # not all the same flat value
    assert min(all_xp) >= 5 and max(all_xp) <= 50  # sane range
    # The hardest practice (slow breathing) pays the most.
    assert max(all_xp) == next(q.xp for q in QUEST_POOL["breathe"] if q.variant == "slow_breathe")


def test_keys_are_the_four_activity_categories():
    # The frontend keys icons/links/colours off q.key, so it must stay a category.
    for category, pool in QUEST_POOL.items():
        assert category in ("meditate", "breathe", "gratitude", "journal")
        assert all(q.key == category for q in pool)


# --- challenge variants surfaced on their date and completed ----------------

def test_long_sit_variant_needs_a_ten_minute_session(client, db_session):
    _auth(client, "longsit@example.com")
    day = _date_for("meditate", "long_sit")
    iso, uid = day.isoformat(), _user_id(db_session, "longsit@example.com")

    client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": 300, "occurred_at": f"{iso}T08:00:00"},
    )
    mq = _quest(db_session, uid, day, "meditate")
    assert mq.variant == "long_sit" and mq.xp == 30 and mq.done is False  # 5 min isn't enough

    client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": 600, "occurred_at": f"{iso}T09:00:00"},
    )
    assert _quest(db_session, uid, day, "meditate").done is True  # 10 min completes it


def test_double_sit_variant_needs_two_sessions(client, db_session):
    _auth(client, "double@example.com")
    day = _date_for("meditate", "double_sit")
    iso, uid = day.isoformat(), _user_id(db_session, "double@example.com")

    client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": 600, "occurred_at": f"{iso}T08:00:00"},
    )
    assert _quest(db_session, uid, day, "meditate").done is False  # one session isn't two

    client.post(
        "/api/v1/sessions",
        json={"type": "body_scan", "duration_seconds": 300, "occurred_at": f"{iso}T20:00:00"},
    )
    mq = _quest(db_session, uid, day, "meditate")
    assert mq.variant == "double_sit" and mq.xp == 25 and mq.done is True


def test_slow_breathe_variant_needs_a_slow_pace(client, db_session):
    _auth(client, "slow@example.com")
    day = _date_for("breathe", "slow_breathe")
    iso, uid = day.isoformat(), _user_id(db_session, "slow@example.com")

    # Fast pace (6 bpm: 4s + 6s) — long enough, but not slow enough.
    client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing", "duration_seconds": 600,
            "occurred_at": f"{iso}T08:00:00", "inhale_seconds": 4, "exhale_seconds": 6,
        },
    )
    bq = _quest(db_session, uid, day, "breathe")
    assert bq.variant == "slow_breathe" and bq.xp == 35 and bq.done is False

    # Slow pace (5 bpm: 5s + 7s = 12s) completes it.
    client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing", "duration_seconds": 600,
            "occurred_at": f"{iso}T09:00:00", "inhale_seconds": 5, "exhale_seconds": 7,
        },
    )
    assert _quest(db_session, uid, day, "breathe").done is True


def test_gratitude_three_variant_needs_three_entries(client, db_session):
    _auth(client, "g3@example.com")
    day = _date_for("gratitude", "gratitude_three")
    uid = _user_id(db_session, "g3@example.com")
    when = datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC)

    # Two entries on the day — short of the "write three" bar.
    for _ in range(2):
        db_session.add(GratitudeEntry(user_id=uid, category="self", text="x", created_at=when))
    db_session.flush()
    gq = _quest(db_session, uid, day, "gratitude")
    assert gq.variant == "gratitude_three" and gq.xp == 25 and gq.done is False

    db_session.add(GratitudeEntry(user_id=uid, category="self", text="x", created_at=when))
    db_session.flush()
    assert _quest(db_session, uid, day, "gratitude").done is True

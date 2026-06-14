"""Anti-spam guards on XP: you can't farm a bunch of XP by flooding trivial entries
(many gratitudes/journals in a day) or spamming 1-second meditations.

- Gratitude/journal XP is capped per local day (only the first N entries pay).
- A meditation earns per *minute*, so a sub-minute sit earns 0 duration XP and does not
  complete the "meditate" daily quest.
"""

from datetime import date

from sqlalchemy import select

from app.models.user import User
from app.services import dashboard_service
from app.services.dashboard_service import (
    GRATITUDE_XP_DAILY_CAP,
    JOURNAL_XP_DAILY_CAP,
)
from app.services.gratitude_service import GRATITUDE_XP
from app.services.journal_service import JOURNAL_XP


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _user_id(db_session, email):
    return db_session.execute(select(User.id).where(User.email == email)).scalar_one()


def _xp(client):
    return client.get("/api/v1/dashboard/stats").json()["xp"]


def test_gratitude_xp_is_capped_per_day(client):
    _auth(client, "gspam@example.com")

    def add():
        client.post("/api/v1/gratitude", json={"category": "people", "text": "x"})

    add()
    xp1 = _xp(client)
    add()
    xp2 = _xp(client)
    assert xp2 - xp1 == GRATITUDE_XP  # a 2nd entry, still under the cap, pays normally

    for _ in range(GRATITUDE_XP_DAILY_CAP):  # push well past the cap
        add()
    capped = _xp(client)
    for _ in range(8):  # a flood beyond the cap
        add()
    assert _xp(client) == capped  # extra same-day entries earn nothing


def test_journal_xp_is_capped_per_day(client):
    _auth(client, "jspam@example.com")

    def add():
        client.post("/api/v1/journals", json={"body": "x"})

    add()
    xp1 = _xp(client)
    add()
    assert _xp(client) - xp1 == JOURNAL_XP  # 2nd entry under the cap pays

    for _ in range(JOURNAL_XP_DAILY_CAP):
        add()
    capped = _xp(client)
    for _ in range(8):
        add()
    assert _xp(client) == capped  # beyond the cap, nothing


def test_one_second_sit_earns_no_xp_and_no_meditate_quest(client, db_session):
    _auth(client, "tiny@example.com")
    uid = _user_id(db_session, "tiny@example.com")
    day = date(2026, 3, 1)
    client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 1,
            "occurred_at": f"{day.isoformat()}T08:00:00",
        },
    )
    stats = dashboard_service.get_stats(
        db_session, uid, today=day, tz="UTC", quest_features=["meditate"]
    )
    mq = next(q for q in stats.daily_quests if q.key == "meditate")
    assert mq.done is False  # a 1-second sit doesn't complete the meditate quest
    # A sub-minute sit doesn't count as practice: no duration XP, no quest, and no streak
    # (so no streak bonus either) — it earns nothing at all.
    assert stats.current_streak_days == 0
    assert stats.xp == 0


def test_one_second_sits_do_not_build_a_streak(client, db_session):
    _auth(client, "streakspam@example.com")
    uid = _user_id(db_session, "streakspam@example.com")
    # A 1-second "sit" on each of three consecutive days — none counts as practice.
    for d in ("2026-04-01", "2026-04-02", "2026-04-03"):
        client.post(
            "/api/v1/sessions",
            json={"type": "mindfulness", "duration_seconds": 1, "occurred_at": f"{d}T08:00:00"},
        )
    stats = dashboard_service.get_stats(
        db_session, uid, today=date(2026, 4, 3), tz="UTC", quest_features=["meditate"]
    )
    assert stats.current_streak_days == 0  # spamming tiny sits builds no streak
    # And the day never lights up the activity heatmap.
    activity = dashboard_service.get_activity(db_session, uid, today=date(2026, 4, 3), tz="UTC")
    assert activity.days == []


def test_real_minute_sit_completes_the_meditate_quest(client, db_session):
    _auth(client, "realsit@example.com")
    uid = _user_id(db_session, "realsit@example.com")
    day = date(2026, 3, 2)
    client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 60,
            "occurred_at": f"{day.isoformat()}T08:00:00",
        },
    )
    stats = dashboard_service.get_stats(
        db_session, uid, today=day, tz="UTC", quest_features=["meditate"]
    )
    mq = next(q for q in stats.daily_quests if q.key == "meditate")
    assert mq.done is True  # a full minute counts

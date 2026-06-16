"""Tests for daily practice reminders: settings API + the send pass.

Also covers the late-day streak-save nudge (send_streak_save_nudges).
"""

from datetime import UTC, datetime, timedelta

from app.models.session import Session as PracticeSession
from app.models.user import User
from app.services import reminder_service
from app.services.dashboard_service import MIN_PRACTICE_SECONDS
from app.services.notifications import email

NOON_UTC = datetime(2026, 6, 12, 12, 0, tzinfo=UTC)

# 21:00 UTC on 2026-06-12 — past STREAK_SAVE_HOUR (20:00) in UTC.
EVENING_UTC = datetime(2026, 6, 12, 21, 0, tzinfo=UTC)


def _auth(client, email_addr):
    client.post("/api/v1/auth/register", json={"email": email_addr, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email_addr, "password": "correct horse"})


# --- settings API -----------------------------------------------------------


def test_reminders_requires_auth(client):
    res = client.post("/api/v1/auth/reminders", json={"enabled": True, "hour": 8})
    assert res.status_code == 401


def test_set_and_clear_reminder(client):
    _auth(client, "r1@example.com")
    res = client.post("/api/v1/auth/reminders", json={"enabled": True, "hour": 8})
    assert res.status_code == 200
    body = res.json()
    assert body["reminder_enabled"] is True
    assert body["reminder_hour"] == 8
    # Disabling clears the stored hour.
    res = client.post("/api/v1/auth/reminders", json={"enabled": False})
    assert res.json()["reminder_enabled"] is False
    assert res.json()["reminder_hour"] is None


def test_enabled_without_hour_rejected(client):
    _auth(client, "r2@example.com")
    assert client.post("/api/v1/auth/reminders", json={"enabled": True}).status_code == 422


def test_hour_out_of_range_rejected(client):
    _auth(client, "r3@example.com")
    assert (
        client.post("/api/v1/auth/reminders", json={"enabled": True, "hour": 24}).status_code
        == 422
    )


# --- send pass --------------------------------------------------------------


def _user(db_session, email_addr, **kwargs):
    user = User(email=email_addr, password_hash="x", **kwargs)
    db_session.add(user)
    db_session.commit()
    return user


def _capture(monkeypatch):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email, "send_email", lambda to, subject, body: sent.append((to, subject, body)) or True
    )
    return sent


def test_due_user_is_reminded(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    user = _user(db_session, "due@example.com", reminder_enabled=True, reminder_hour=8)
    count = reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC)
    assert count == 1
    assert len(sent) == 1 and sent[0][0] == "due@example.com"
    db_session.refresh(user)
    assert user.reminder_last_sent_at is not None


def test_disabled_user_not_reminded(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    _user(db_session, "off@example.com", reminder_enabled=False, reminder_hour=8)
    assert reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC) == 0
    assert sent == []


def test_before_hour_not_reminded(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    _user(db_session, "early@example.com", reminder_enabled=True, reminder_hour=20)
    assert reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC) == 0
    assert sent == []


def test_not_reminded_twice_same_day(monkeypatch, db_session):
    _capture(monkeypatch)
    _user(db_session, "once@example.com", reminder_enabled=True, reminder_hour=8)
    assert reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC) == 1
    # A second pass an hour later sends nothing.
    later = datetime(2026, 6, 12, 13, 0, tzinfo=UTC)
    assert reminder_service.send_due_reminders(db_session, now_utc=later) == 0


def test_practiced_today_not_reminded(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    user = _user(db_session, "active@example.com", reminder_enabled=True, reminder_hour=8)
    db_session.add(
        PracticeSession(
            user_id=user.id, type="mindfulness", duration_seconds=600, occurred_at=NOON_UTC
        )
    )
    db_session.commit()
    assert reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC) == 0
    assert sent == []


def test_reminder_uses_user_timezone(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    # 12:00 UTC is 21:00 in Tokyo: hour 22 hasn't arrived, hour 8 has.
    _user(
        db_session,
        "late@example.com",
        reminder_enabled=True,
        reminder_hour=22,
        timezone="Asia/Tokyo",
    )
    _user(
        db_session,
        "morning@example.com",
        reminder_enabled=True,
        reminder_hour=8,
        timezone="Asia/Tokyo",
    )
    assert reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC) == 1
    assert [to for to, _, _ in sent] == ["morning@example.com"]


# --- streak-save nudge -------------------------------------------------------


def _add_session(db_session, user_id, occurred_at):
    """Record a practice session that counts for streak purposes (> MIN_PRACTICE_SECONDS)."""
    db_session.add(
        PracticeSession(
            user_id=user_id,
            type="mindfulness",
            duration_seconds=MIN_PRACTICE_SECONDS,
            occurred_at=occurred_at,
        )
    )
    db_session.commit()


def test_streak_at_risk_sends_nudge(monkeypatch, db_session):
    """User with an active streak + no practice today + evening → nudge sent."""
    sent = _capture(monkeypatch)
    user = _user(db_session, "streak@example.com", reminder_enabled=True, reminder_hour=8)
    # Practice yesterday to establish a 1-day streak.
    _add_session(db_session, user.id, EVENING_UTC - timedelta(days=1))
    count = reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC)
    assert count == 1
    assert len(sent) == 1
    assert sent[0][0] == "streak@example.com"
    assert "streak" in sent[0][1].lower() or "streak" in sent[0][2].lower()
    db_session.refresh(user)
    assert user.streak_save_last_sent_at is not None


def test_practiced_today_no_streak_save_nudge(monkeypatch, db_session):
    """User who has already practiced today does not receive a nudge."""
    sent = _capture(monkeypatch)
    user = _user(db_session, "done@example.com", reminder_enabled=True, reminder_hour=8)
    _add_session(db_session, user.id, EVENING_UTC - timedelta(days=1))  # streak
    _add_session(db_session, user.id, EVENING_UTC - timedelta(hours=3))  # practiced today
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC) == 0
    assert sent == []


def test_disabled_reminders_no_streak_save_nudge(monkeypatch, db_session):
    """A user who has opted out of reminders receives no streak-save nudge."""
    sent = _capture(monkeypatch)
    user = _user(db_session, "noremind@example.com", reminder_enabled=False, reminder_hour=None)
    _add_session(db_session, user.id, EVENING_UTC - timedelta(days=1))
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC) == 0
    assert sent == []


def test_no_streak_no_nudge(monkeypatch, db_session):
    """A user with no active streak (never practiced) gets no streak-save nudge."""
    sent = _capture(monkeypatch)
    _user(db_session, "nostreak@example.com", reminder_enabled=True, reminder_hour=8)
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC) == 0
    assert sent == []


def test_rest_day_safe_no_streak_save_nudge(monkeypatch, db_session):
    """Streak is still safe via rest-day insurance → do not nudge.

    User practiced 2 days ago but not yesterday. The rest-day allowance bridges
    that gap, so today the streak is still alive without practice (rest_day_used=True).
    """
    sent = _capture(monkeypatch)
    user = _user(db_session, "restday@example.com", reminder_enabled=True, reminder_hour=8)
    # Practice 2 days ago; yesterday was a rest day (gap bridged by insurance).
    _add_session(db_session, user.id, EVENING_UTC - timedelta(days=2))
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC) == 0
    assert sent == []


def test_streak_save_no_double_send(monkeypatch, db_session):
    """Streak-save nudge fires at most once per local day."""
    _capture(monkeypatch)
    user = _user(db_session, "once_ss@example.com", reminder_enabled=True, reminder_hour=8)
    _add_session(db_session, user.id, EVENING_UTC - timedelta(days=1))
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC) == 1
    # Second pass an hour later sends nothing.
    later = EVENING_UTC + timedelta(hours=1)
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=later) == 0


def test_streak_save_before_threshold_not_sent(monkeypatch, db_session):
    """Streak-save nudge does not fire before STREAK_SAVE_HOUR in the user's timezone."""
    sent = _capture(monkeypatch)
    user = _user(
        db_session,
        "early_ss@example.com",
        reminder_enabled=True,
        reminder_hour=8,
        timezone="UTC",
    )
    _add_session(db_session, user.id, NOON_UTC - timedelta(days=1))
    # Noon UTC is before 20:00.
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=NOON_UTC) == 0
    assert sent == []


def test_streak_save_respects_timezone(monkeypatch, db_session):
    """Streak-save fires correctly in a non-UTC timezone.

    12:00 UTC = 21:00 Tokyo (past threshold). User in Tokyo with an at-risk streak
    should get the nudge; user in UTC (where it's only noon) should not.
    """
    sent = _capture(monkeypatch)
    user_tokyo = _user(
        db_session,
        "tokyo_ss@example.com",
        reminder_enabled=True,
        reminder_hour=8,
        timezone="Asia/Tokyo",
    )
    user_utc = _user(
        db_session,
        "utc_ss@example.com",
        reminder_enabled=True,
        reminder_hour=8,
        timezone="UTC",
    )
    # Both have a streak (practiced yesterday UTC).
    _add_session(db_session, user_tokyo.id, NOON_UTC - timedelta(days=1))
    _add_session(db_session, user_utc.id, NOON_UTC - timedelta(days=1))
    count = reminder_service.send_streak_save_nudges(db_session, now_utc=NOON_UTC)
    assert count == 1
    assert [to for to, _, _ in sent] == ["tokyo_ss@example.com"]


def test_streak_save_does_not_block_morning_reminder(monkeypatch, db_session):
    """A sent streak-save nudge does not prevent the morning daily reminder (separate channels)."""
    _capture(monkeypatch)
    user = _user(db_session, "both@example.com", reminder_enabled=True, reminder_hour=8)
    _add_session(db_session, user.id, EVENING_UTC - timedelta(days=1))
    # Evening: streak-save fires.
    assert reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC) == 1
    # Next morning: daily reminder fires independently (different day = different idempotency key).
    next_morning = datetime(2026, 6, 13, 9, 0, tzinfo=UTC)  # after midnight UTC
    assert reminder_service.send_due_reminders(db_session, now_utc=next_morning) == 1


def test_console_email_sender_returns_true():
    # With no SMTP configured the sender logs and reports success.
    assert email.send_email("x@example.com", "subject", "body") is True

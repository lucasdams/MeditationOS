"""Tests for the opt-in weekly summary email: settings API + the send pass."""

from datetime import UTC, datetime

from app.models.user import User
from app.services import weekly_review_service
from app.services.notifications import email

# A fixed send time: 10:00 UTC (past SUMMARY_SEND_HOUR=9). Tests derive the weekday.
SEND_TIME = datetime(2026, 6, 12, 10, 0, tzinfo=UTC)
SEND_DAY = SEND_TIME.weekday()  # 0=Mon … 6=Sun


def _auth(client, email_addr):
    client.post("/api/v1/auth/register", json={"email": email_addr, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email_addr, "password": "correct horse"})


# --- settings API -----------------------------------------------------------


def test_weekly_summary_requires_auth(client):
    res = client.post("/api/v1/auth/weekly-summary", json={"enabled": True, "day": 1})
    assert res.status_code == 401


def test_set_and_clear_weekly_summary(client):
    _auth(client, "ws1@example.com")
    res = client.post("/api/v1/auth/weekly-summary", json={"enabled": True, "day": 1})
    assert res.status_code == 200
    assert res.json()["weekly_summary_enabled"] is True
    assert res.json()["weekly_summary_day"] == 1
    # Disabling clears the stored day.
    res = client.post("/api/v1/auth/weekly-summary", json={"enabled": False})
    assert res.json()["weekly_summary_enabled"] is False
    assert res.json()["weekly_summary_day"] is None


def test_enabled_without_day_rejected(client):
    _auth(client, "ws2@example.com")
    assert client.post("/api/v1/auth/weekly-summary", json={"enabled": True}).status_code == 422


def test_day_out_of_range_rejected(client):
    _auth(client, "ws3@example.com")
    res = client.post("/api/v1/auth/weekly-summary", json={"enabled": True, "day": 7})
    assert res.status_code == 422


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


def test_due_user_gets_summary(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    user = _user(
        db_session, "due@example.com", weekly_summary_enabled=True, weekly_summary_day=SEND_DAY
    )
    assert weekly_review_service.send_due_weekly_summaries(db_session, now_utc=SEND_TIME) == 1
    assert sent and sent[0][0] == "due@example.com"
    db_session.refresh(user)
    assert user.weekly_summary_last_sent_at is not None


def test_disabled_user_skipped(monkeypatch, db_session):
    sent = _capture(monkeypatch)
    _user(db_session, "off@example.com", weekly_summary_enabled=False, weekly_summary_day=SEND_DAY)
    assert weekly_review_service.send_due_weekly_summaries(db_session, now_utc=SEND_TIME) == 0
    assert sent == []


def test_wrong_day_skipped(monkeypatch, db_session):
    _capture(monkeypatch)
    _user(
        db_session, "wrongday@example.com",
        weekly_summary_enabled=True, weekly_summary_day=(SEND_DAY + 1) % 7,
    )
    assert weekly_review_service.send_due_weekly_summaries(db_session, now_utc=SEND_TIME) == 0


def test_before_send_hour_skipped(monkeypatch, db_session):
    _capture(monkeypatch)
    _user(db_session, "early@example.com", weekly_summary_enabled=True, weekly_summary_day=SEND_DAY)
    early = SEND_TIME.replace(hour=7)  # before SUMMARY_SEND_HOUR
    assert weekly_review_service.send_due_weekly_summaries(db_session, now_utc=early) == 0


def test_not_sent_twice_in_a_week(monkeypatch, db_session):
    _capture(monkeypatch)
    _user(db_session, "once@example.com", weekly_summary_enabled=True, weekly_summary_day=SEND_DAY)
    assert weekly_review_service.send_due_weekly_summaries(db_session, now_utc=SEND_TIME) == 1
    later = SEND_TIME.replace(hour=14)  # same day, same week
    assert weekly_review_service.send_due_weekly_summaries(db_session, now_utc=later) == 0

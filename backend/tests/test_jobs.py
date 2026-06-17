"""Tests for scheduled-job safety: advisory-lock skip path and per-user resilience.

Fix 3 from the ops audit:
  - Advisory-lock skip: if pg_try_advisory_lock returns False the job must no-op.
  - Per-user resilience: one user's send error must not abort the rest of the batch.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock

from app.jobs import send_reminders as reminders_job
from app.jobs import send_weekly_summaries as weekly_job
from app.models.user import User
from app.services import reminder_service
from app.services.notifications import email

NOON_UTC = datetime(2026, 6, 12, 12, 0, tzinfo=UTC)
EVENING_UTC = datetime(2026, 6, 12, 21, 0, tzinfo=UTC)


# ── helpers ───────────────────────────────────────────────────────────────────


def _user(db_session, email_addr, **kwargs):
    user = User(email=email_addr, password_hash="x", **kwargs)
    db_session.add(user)
    db_session.commit()
    return user


def _capture(monkeypatch):
    sent: list[tuple[str, str, str, dict | None]] = []

    def _stub(to, subject, body, headers=None):
        sent.append((to, subject, body, headers))
        return True

    monkeypatch.setattr(email, "send_email", _stub)
    return sent


# ── advisory-lock skip path ───────────────────────────────────────────────────


def test_send_reminders_skips_when_lock_held(monkeypatch):
    """main() must return 0 and send nothing when pg_try_advisory_lock returns False."""
    sent = _capture(monkeypatch)

    # Build a minimal db mock that returns False for the advisory lock query.
    db_mock = MagicMock()
    db_mock.execute.return_value.scalar.return_value = False

    mock_local = MagicMock(return_value=db_mock)
    monkeypatch.setattr(reminders_job, "SessionLocal", mock_local)

    result = reminders_job.main()

    assert result == 0
    assert sent == [], "no emails should be sent when the lock is not acquired"


def test_send_weekly_skips_when_lock_held(monkeypatch):
    """main() must return 0 and send nothing when pg_try_advisory_lock returns False."""
    sent = _capture(monkeypatch)

    db_mock = MagicMock()
    db_mock.execute.return_value.scalar.return_value = False

    mock_local = MagicMock(return_value=db_mock)
    monkeypatch.setattr(weekly_job, "SessionLocal", mock_local)

    result = weekly_job.main()

    assert result == 0
    assert sent == [], "no emails should be sent when the lock is not acquired"


# ── per-user resilience ───────────────────────────────────────────────────────


def test_due_reminder_error_on_one_user_does_not_abort_batch(monkeypatch, db_session):
    """If send_email raises for one user, the remaining users are still processed."""
    # Create two users who are both due for a reminder.
    _user(db_session, "good@example.com", reminder_enabled=True, reminder_hour=8)
    _user(db_session, "bad@example.com", reminder_enabled=True, reminder_hour=8)

    calls: list[str] = []

    def _selective_send(to, subject, body, headers=None):
        if to == "bad@example.com":
            raise RuntimeError("SMTP timeout")
        calls.append(to)
        return True

    monkeypatch.setattr(email, "send_email", _selective_send)

    # Should not raise; the bad user is logged and skipped.
    count = reminder_service.send_due_reminders(db_session, now_utc=NOON_UTC)

    # The good user was sent; the bad one was skipped after the exception.
    assert "good@example.com" in calls
    # count reflects only the successful sends (bad user errored before incrementing)
    assert count >= 1


def test_streak_save_error_on_one_user_does_not_abort_batch(monkeypatch, db_session):
    """If send_email raises for one user in send_streak_save_nudges, others are processed."""
    import uuid
    from datetime import timedelta

    from app.models.session import Session as PracticeSession
    from app.services.dashboard_service import MIN_PRACTICE_SECONDS

    # Create two users with an at-risk streak (need a session history day yesterday).

    today = EVENING_UTC.date()
    yesterday = today - timedelta(days=1)

    for addr in ["sgood@example.com", "sbad@example.com"]:
        u = _user(
            db_session,
            addr,
            reminder_enabled=True,
            timezone="UTC",
        )
        # Add a session yesterday so the user has a streak at risk today.
        session = PracticeSession(
            id=uuid.uuid4(),
            user_id=u.id,
            type="mindfulness",
            duration_seconds=MIN_PRACTICE_SECONDS,
            occurred_at=datetime(yesterday.year, yesterday.month, yesterday.day, 10, 0, tzinfo=UTC),
        )
        db_session.add(session)
    db_session.commit()

    calls: list[str] = []

    def _selective_send(to, subject, body, headers=None):
        if to == "sbad@example.com":
            raise RuntimeError("SMTP timeout")
        calls.append(to)
        return True

    monkeypatch.setattr(email, "send_email", _selective_send)

    count = reminder_service.send_streak_save_nudges(db_session, now_utc=EVENING_UTC)

    assert "sgood@example.com" in calls
    assert count >= 1

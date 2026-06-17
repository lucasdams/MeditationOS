"""Tests for the per-email login throttle (resists distributed brute force)."""

from datetime import UTC, datetime, timedelta

from app.core import login_guard
from app.core.config import settings


def _register(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})


def _login(client, email, pw):
    return client.post("/api/v1/auth/login", json={"email": email, "password": pw}).status_code


def test_login_locks_after_repeated_failures(client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    email = "lockme@example.com"
    _register(client, email)
    login_guard.clear(email)
    for _ in range(3):
        assert _login(client, email, "wrong") == 401
    # Locked now — even the correct password is refused (429) until the window passes.
    assert _login(client, email, "correct horse") == 429
    login_guard.clear(email)


def test_lock_is_per_email(client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 2)
    _register(client, "a_lock@example.com")
    _register(client, "b_lock@example.com")
    login_guard.clear("a_lock@example.com")
    login_guard.clear("b_lock@example.com")
    for _ in range(2):
        _login(client, "a_lock@example.com", "wrong")
    assert _login(client, "a_lock@example.com", "correct horse") == 429
    # A different account is unaffected.
    assert _login(client, "b_lock@example.com", "correct horse") == 200
    login_guard.clear("a_lock@example.com")


def test_success_resets_the_counter(client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    email = "reset_lock@example.com"
    _register(client, email)
    login_guard.clear(email)
    assert _login(client, email, "wrong") == 401
    assert _login(client, email, "wrong") == 401
    assert _login(client, email, "correct horse") == 200  # success clears failures
    # Earlier failures no longer count toward the lock.
    assert _login(client, email, "wrong") == 401
    login_guard.clear(email)


def test_failure_exactly_at_window_boundary_is_not_locked(monkeypatch):
    """A failure timestamped exactly `window` ago has expired (the filter uses `<`).

    `_recent` keeps `t` only while `now - t < window`. At the exact boundary
    `now - t == window`, so it is dropped — a single ceiling-count failure parked right
    on the edge must NOT lock the account. This pins the strict `<` (not `<=`).
    """
    email = "boundary@example.com"
    monkeypatch.setattr(settings, "login_max_failures", 1)
    window = timedelta(minutes=settings.login_failure_window_minutes)
    # One failure (enough to hit the ceiling of 1) parked exactly `window` in the past.
    login_guard._failures[email] = [datetime.now(UTC) - window]
    try:
        assert login_guard.is_locked(email) is False
    finally:
        login_guard.clear(email)

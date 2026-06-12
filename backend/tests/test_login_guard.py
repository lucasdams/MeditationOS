"""Tests for the per-email login throttle (resists distributed brute force)."""

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

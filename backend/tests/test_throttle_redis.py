"""The Redis-backed branch of the per-email throttles (login_guard / send_guard).

Exercised with fakeredis so no live server is needed. The in-memory branch (REDIS_URL unset,
the default under tests) is covered by test_login_guard.py and the auth suites.
"""

import fakeredis
import pytest

from app.core import login_guard, send_guard, throttle_store
from app.core.config import settings


@pytest.fixture
def fake_redis(monkeypatch):
    client = fakeredis.FakeRedis(decode_responses=True)
    # Both guards call throttle_store.get_redis() each time, so patching the module attr
    # routes them onto the fake shared store.
    monkeypatch.setattr(throttle_store, "get_redis", lambda: client)
    return client


def test_login_guard_locks_after_max_failures_in_redis(fake_redis, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    email = "attacker@example.com"

    assert not login_guard.is_locked(email)
    login_guard.record_failure(email)
    login_guard.record_failure(email)
    assert not login_guard.is_locked(email)  # under the ceiling

    login_guard.record_failure(email)
    assert login_guard.is_locked(email)  # hit the ceiling
    assert login_guard.is_locked("ATTACKER@example.com")  # keyed case-insensitively

    login_guard.clear(email)
    assert not login_guard.is_locked(email)


def test_send_guard_cooldown_in_redis(fake_redis):
    email = "victim@example.com"

    assert not send_guard.is_throttled(email)
    send_guard.record_sent(email)
    assert send_guard.is_throttled(email)
    assert send_guard.is_throttled("VICTIM@example.com")  # keyed case-insensitively

    send_guard.clear(email)
    assert not send_guard.is_throttled(email)

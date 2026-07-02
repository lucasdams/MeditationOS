"""Per-email login throttle: lock an account's login after too many failures in a
window. Complements the per-IP limiter, which a *distributed* brute force (many IPs,
one account) would slip past. Keyed by lower-cased email.

Backed by Redis when `settings.redis_url` is set (shared across workers/hosts via a
sorted set of failure timestamps), else an in-memory sliding window — fine for a
single process. See `app/core/throttle_store.py`.
"""

import uuid
from datetime import UTC, datetime, timedelta

from app.core import throttle_store
from app.core.config import settings

_failures: dict[str, list[datetime]] = {}

_REDIS_PREFIX = "login_fail:"


def _rkey(email: str) -> str:
    return f"{_REDIS_PREFIX}{email}"


def _window_seconds() -> int:
    return settings.login_failure_window_minutes * 60


# --- in-memory backend ---------------------------------------------------------


def _recent(email: str, now: datetime) -> list[datetime]:
    window = timedelta(minutes=settings.login_failure_window_minutes)
    kept = [t for t in _failures.get(email, []) if now - t < window]
    if kept:
        _failures[email] = kept
    else:
        _failures.pop(email, None)
    return kept


# --- Redis backend (sorted set: member = unique token, score = unix ts) --------


def _redis_failure_count(r, email: str, now: datetime) -> int:
    key = _rkey(email)
    r.zremrangebyscore(key, 0, now.timestamp() - _window_seconds())
    return r.zcard(key)


def _redis_record(r, email: str, now: datetime) -> None:
    key = _rkey(email)
    r.zadd(key, {uuid.uuid4().hex: now.timestamp()})
    r.expire(key, _window_seconds())


# --- public API ----------------------------------------------------------------


def is_locked(email: str) -> bool:
    """True if this email has hit the failure ceiling within the window."""
    key = email.lower()
    now = datetime.now(UTC)
    r = throttle_store.get_redis()
    count = _redis_failure_count(r, key, now) if r is not None else len(_recent(key, now))
    return count >= settings.login_max_failures


def record_failure(email: str) -> None:
    key = email.lower()
    now = datetime.now(UTC)
    r = throttle_store.get_redis()
    if r is not None:
        _redis_record(r, key, now)
        return
    _failures.setdefault(key, []).append(now)


def clear(email: str) -> None:
    """Reset on a successful login."""
    key = email.lower()
    r = throttle_store.get_redis()
    if r is not None:
        r.delete(_rkey(key))
        return
    _failures.pop(key, None)

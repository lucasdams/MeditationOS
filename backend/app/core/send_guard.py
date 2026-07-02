"""Per-email cooldown for transactional sends (password reset, verification resend).

The per-IP limiter alone lets a distributed attacker (many IPs, one victim address)
inbox-bomb a single email; this throttles by the *target address* instead. Keyed by
lower-cased email, with a short cooldown between consecutive sends.

Backed by Redis when `settings.redis_url` is set (a key with a TTL = the cooldown, so
it's shared across workers/hosts and self-expiring), else an in-memory map — fine for
a single process. See `app/core/throttle_store.py`.
"""

from datetime import UTC, datetime, timedelta

from app.core import throttle_store
from app.core.config import settings

_last_sent: dict[str, datetime] = {}

# Above this size, prune expired entries on the next write so a flood of distinct
# addresses can't grow the map without bound (entries past the cooldown are dead).
_PRUNE_THRESHOLD = 1024

_REDIS_PREFIX = "send_cooldown:"


def _rkey(email: str) -> str:
    return f"{_REDIS_PREFIX}{email}"


def is_throttled(email: str) -> bool:
    """True if a send to this email happened within the cooldown window."""
    key = email.lower()
    r = throttle_store.get_redis()
    if r is not None:
        return bool(r.exists(_rkey(key)))
    cooldown = timedelta(seconds=settings.email_send_cooldown_seconds)
    last = _last_sent.get(key)
    return last is not None and datetime.now(UTC) - last < cooldown


def record_sent(email: str) -> None:
    """Mark that a send to this email just happened (starts the cooldown)."""
    key = email.lower()
    r = throttle_store.get_redis()
    if r is not None:
        # A key that self-expires after the cooldown — no manual pruning needed.
        r.set(_rkey(key), "1", ex=settings.email_send_cooldown_seconds)
        return
    now = datetime.now(UTC)
    if len(_last_sent) > _PRUNE_THRESHOLD:
        cutoff = now - timedelta(seconds=settings.email_send_cooldown_seconds)
        for k in [k for k, ts in _last_sent.items() if ts < cutoff]:
            del _last_sent[k]
    _last_sent[key] = now


def clear(email: str) -> None:
    """Drop the cooldown for an email (used by tests)."""
    key = email.lower()
    r = throttle_store.get_redis()
    if r is not None:
        r.delete(_rkey(key))
        return
    _last_sent.pop(key, None)

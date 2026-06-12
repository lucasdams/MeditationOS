"""Per-email login throttle: lock an account's login after too many failures in a
window. Complements the per-IP limiter, which a *distributed* brute force (many IPs,
one account) would slip past.

In-memory sliding window — fine for a single process; in a multi-worker / multi-host
deploy this should move to a shared store (e.g. Redis). Keyed by lower-cased email.
"""

from datetime import UTC, datetime, timedelta

from app.core.config import settings

_failures: dict[str, list[datetime]] = {}


def _recent(email: str, now: datetime) -> list[datetime]:
    window = timedelta(minutes=settings.login_failure_window_minutes)
    kept = [t for t in _failures.get(email, []) if now - t < window]
    if kept:
        _failures[email] = kept
    else:
        _failures.pop(email, None)
    return kept


def is_locked(email: str) -> bool:
    """True if this email has hit the failure ceiling within the window."""
    return len(_recent(email.lower(), datetime.now(UTC))) >= settings.login_max_failures


def record_failure(email: str) -> None:
    _failures.setdefault(email.lower(), []).append(datetime.now(UTC))


def clear(email: str) -> None:
    """Reset on a successful login."""
    _failures.pop(email.lower(), None)

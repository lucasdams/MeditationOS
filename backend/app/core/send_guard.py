"""Per-email cooldown for transactional sends (password reset, verification resend).

The per-IP limiter alone lets a distributed attacker (many IPs, one victim address)
inbox-bomb a single email; this throttles by the *target address* instead. Keyed by
lower-cased email, with a short cooldown between consecutive sends.

In-memory — fine for a single process; a multi-worker / multi-host deploy should move
this to a shared store (e.g. Redis), like login_guard.
"""

from datetime import UTC, datetime, timedelta

from app.core.config import settings

_last_sent: dict[str, datetime] = {}


def is_throttled(email: str) -> bool:
    """True if a send to this email happened within the cooldown window."""
    cooldown = timedelta(seconds=settings.email_send_cooldown_seconds)
    last = _last_sent.get(email.lower())
    return last is not None and datetime.now(UTC) - last < cooldown


def record_sent(email: str) -> None:
    """Mark that a send to this email just happened (starts the cooldown)."""
    _last_sent[email.lower()] = datetime.now(UTC)


def clear(email: str) -> None:
    """Drop the cooldown for an email (used by tests)."""
    _last_sent.pop(email.lower(), None)

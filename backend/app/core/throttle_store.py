"""Optional shared backing store (Redis) for the per-email throttles.

When `settings.redis_url` is set, `login_guard` and `send_guard` keep their state in Redis so it
holds across multiple workers/hosts; when unset, each guard uses its own in-memory dict — correct
for a single process, but per-worker once you scale out (which is what this exists to fix). The
client is created once and reused.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:  # import only for type-checkers; the runtime import is lazy below
    from redis import Redis


@lru_cache(maxsize=1)
def get_redis() -> Redis | None:
    """A shared Redis client when `REDIS_URL` is configured, else None (→ in-memory throttles).

    The `redis` package is imported lazily so it's only required when a URL is actually set.
    `decode_responses=True` so keys/values round-trip as str."""
    if not settings.redis_url:
        return None
    import redis  # lazy — only needed when configured

    return redis.Redis.from_url(settings.redis_url, decode_responses=True)

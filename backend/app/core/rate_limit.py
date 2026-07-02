"""Shared rate limiter (slowapi). Disabled under tests for determinism;
enforced in dev/prod. Applied to sensitive routes like login.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import settings


def client_ip(request: Request) -> str:
    """The client IP to rate-limit on. Behind a trusted reverse proxy (TRUST_PROXY),
    use the left-most X-Forwarded-For entry; otherwise the socket peer. We never trust
    XFF by default — it's client-supplied and trivially spoofed to dodge limits."""
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# When REDIS_URL is set the limiter counts in Redis (shared across workers/hosts); otherwise
# slowapi's default in-memory storage (per-process). `storage_uri` accepts a redis:// URL.
limiter = Limiter(
    key_func=client_ip,
    enabled=settings.environment != "test",
    storage_uri=settings.redis_url or "memory://",
)

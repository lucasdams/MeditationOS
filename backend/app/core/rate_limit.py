"""Shared rate limiter (slowapi). Disabled under tests for determinism;
enforced in dev/prod. Applied to sensitive routes like login.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.environment != "test",
)

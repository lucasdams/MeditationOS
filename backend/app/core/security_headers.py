"""Standard security response headers, applied to every response (defense in depth).

Sensible defaults for a JSON API:
- nosniff: don't let browsers MIME-sniff responses.
- X-Frame-Options DENY + COOP: anti-clickjacking / cross-origin isolation.
- Referrer-Policy / Permissions-Policy: minimise leakage and disable unused APIs.
- HSTS: only in production (it requires HTTPS).

A strict Content-Security-Policy is intentionally left to the frontend/edge that
serves the HTML — this service returns JSON and also serves Swagger UI at `/docs`,
which loads its own scripts. `setdefault` is used so we never clobber a header a
route (or CORS) already set.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for key, value in _HEADERS.items():
            response.headers.setdefault(key, value)
        if settings.environment == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
            )
        return response

"""MeditationOS API entrypoint.

Creates the FastAPI app, applies CORS from settings, registers the rate limiter,
and mounts the v1 router. Routes live in `app/api/routes/`; business logic and DB
access go in services — see docs/decisions/0006-layered-architecture.md.
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import DAILY_LIMIT_DETAIL, DailyLimitError
from app.core.observability import init_sentry
from app.core.rate_limit import limiter
from app.core.security_headers import SecurityHeadersMiddleware

# Initialise Sentry before the app object is created so the SDK can instrument
# all middleware and route handlers.  No-op when SENTRY_DSN is not configured.
init_sentry(
    dsn=settings.sentry_dsn,
    environment=settings.environment,
    traces_sample_rate=settings.sentry_traces_sample_rate,
)

app = FastAPI(title="MeditationOS API")

# Rate limiting (slowapi): expose the limiter and map breaches to HTTP 429.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(DailyLimitError)
async def _daily_limit_handler(request: Request, exc: DailyLimitError) -> JSONResponse:
    """Map the per-day creation cap (raised in services) to HTTP 429 app-wide, so
    individual route handlers don't each catch and re-raise it."""
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": DAILY_LIMIT_DETAIL},
    )

# Standard security response headers on every response (see security_headers.py).
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

"""MeditationOS API entrypoint.

Creates the FastAPI app, applies CORS from settings, registers the rate limiter,
and mounts the v1 router. Routes live in `app/api/routes/`; business logic and DB
access go in services — see docs/decisions/0006-layered-architecture.md.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import settings
from app.core.db import engine
from app.core.exceptions import DAILY_LIMIT_DETAIL, DailyLimitError
from app.core.logging_config import RequestIdMiddleware, configure_logging
from app.core.observability import init_sentry
from app.core.rate_limit import client_ip, limiter
from app.core.security_headers import SecurityHeadersMiddleware

# Configure structured (JSON in non-dev) logging with request-id correlation
# before anything logs, so startup messages are captured in the right format.
configure_logging()

logger = logging.getLogger(__name__)

# Initialise Sentry before the app object is created so the SDK can instrument
# all middleware and route handlers.  No-op when SENTRY_DSN is not configured.
init_sentry(
    dsn=settings.sentry_dsn,
    environment=settings.environment,
    traces_sample_rate=settings.sentry_traces_sample_rate,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """App lifecycle. On shutdown (SIGTERM/rollout) dispose the SQLAlchemy engine
    so the connection pool is released cleanly instead of leaving sockets to time
    out server-side. Startup side-effects (Sentry, logging) run at import above."""
    yield
    logger.info("Shutting down: disposing database engine pool")
    engine.dispose()


app = FastAPI(title="MeditationOS API", lifespan=lifespan)

# Rate limiting (slowapi): expose the limiter and map breaches to HTTP 429.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Log per-IP rate-limit breaches (a spike is an attack signal worth seeing)
    before delegating to slowapi's default handler, which injects Retry-After."""
    logger.warning(
        "Rate limit exceeded",
        extra={"client_ip": client_ip(request), "path": request.url.path},
    )
    return _rate_limit_exceeded_handler(request, exc)


@app.exception_handler(DailyLimitError)
async def _daily_limit_handler(request: Request, exc: DailyLimitError) -> JSONResponse:
    """Map the per-day creation cap (raised in services) to HTTP 429 app-wide, so
    individual route handlers don't each catch and re-raise it."""
    logger.warning(
        "Daily creation limit reached",
        extra={"client_ip": client_ip(request), "path": request.url.path},
    )
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

# Bind a correlation id per request (read or generated), echo it on the response,
# and surface it in logs + Sentry. Added last so it wraps outermost — the id is
# bound before every other middleware and handler runs and is present on all logs.
app.add_middleware(RequestIdMiddleware)

app.include_router(api_router, prefix="/api/v1")

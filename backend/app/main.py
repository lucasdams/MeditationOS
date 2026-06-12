"""MeditationOS API entrypoint.

Creates the FastAPI app, applies CORS from settings, registers the rate limiter,
and mounts the v1 router. Routes live in `app/api/routes/`; business logic and DB
access go in services — see docs/decisions/0006-layered-architecture.md.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security_headers import SecurityHeadersMiddleware

app = FastAPI(title="MeditationOS API")

# Rate limiting (slowapi): expose the limiter and map breaches to HTTP 429.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

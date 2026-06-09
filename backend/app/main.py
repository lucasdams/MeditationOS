"""MeditationOS API entrypoint.

Creates the FastAPI app, applies CORS from settings, and mounts the v1 router.
Routes live in `app/api/routes/`; business logic and DB access go in services
(added in later tickets) — see docs/decisions/0006-layered-architecture.md.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

app = FastAPI(title="MeditationOS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

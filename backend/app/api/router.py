"""Aggregates all v1 route modules into a single router, mounted under /api/v1."""

from fastapi import APIRouter

from app.api.routes import (
    analytics,
    auth,
    breathing_patterns,
    dashboard,
    goals,
    gratitude,
    health,
    journals,
    mood_logs,
    sanctuary,
    sessions,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(sessions.router)
api_router.include_router(dashboard.router)
api_router.include_router(analytics.router)
api_router.include_router(breathing_patterns.router)
api_router.include_router(gratitude.router)
api_router.include_router(journals.router)
api_router.include_router(mood_logs.router)
api_router.include_router(goals.router)
api_router.include_router(sanctuary.router)

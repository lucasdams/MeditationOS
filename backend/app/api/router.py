"""Aggregates all v1 route modules into a single router, mounted under /api/v1."""

from fastapi import APIRouter

from app.api.routes import (
    admin,
    analytics,
    auth,
    biometric_readings,
    breathing_patterns,
    dashboard,
    friends,
    goals,
    gratitude,
    health,
    journals,
    mood_logs,
    paths,
    push,
    scheduled_sessions,
    sessions,
    spirit,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(sessions.router)
api_router.include_router(biometric_readings.router)
api_router.include_router(dashboard.router)
api_router.include_router(analytics.router)
api_router.include_router(breathing_patterns.router)
api_router.include_router(gratitude.router)
api_router.include_router(journals.router)
api_router.include_router(mood_logs.router)
api_router.include_router(paths.router)
api_router.include_router(goals.router)
api_router.include_router(friends.router)
api_router.include_router(push.router)
api_router.include_router(scheduled_sessions.router)
api_router.include_router(spirit.router)
api_router.include_router(admin.router)

"""Aggregates all v1 route modules into a single router, mounted under /api/v1."""

from fastapi import APIRouter

from app.api.routes import health

api_router = APIRouter()
api_router.include_router(health.router)

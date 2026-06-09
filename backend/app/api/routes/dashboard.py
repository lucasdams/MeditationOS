"""Dashboard routes. Thin handler — delegates aggregation to the service."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.dashboard import ActivityCalendar, DashboardStats
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStats:
    return dashboard_service.get_stats(db, current_user.id, today=datetime.now(UTC).date())


@router.get("/activity", response_model=ActivityCalendar)
def get_activity(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActivityCalendar:
    return dashboard_service.get_activity(db, current_user.id, today=datetime.now(UTC).date())

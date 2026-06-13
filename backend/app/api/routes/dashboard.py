"""Dashboard routes. Thin handler — delegates aggregation to the service."""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.dashboard import ActivityCalendar, DashboardStats
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _today_for(user: User) -> tuple[date, str]:
    """The user's current local date + their timezone (falls back to UTC)."""
    tz = user.timezone or "UTC"
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        tz, zone = "UTC", ZoneInfo("UTC")
    return datetime.now(zone).date(), tz


@router.get("/stats", response_model=DashboardStats)
def get_stats(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStats:
    today, tz = _today_for(current_user)
    return dashboard_service.get_stats(
        db,
        current_user.id,
        today=today,
        tz=tz,
        quest_features=current_user.quest_features,
    )


@router.get("/activity", response_model=ActivityCalendar)
def get_activity(
    days: int = Query(365, ge=1, le=366),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActivityCalendar:
    today, tz = _today_for(current_user)
    return dashboard_service.get_activity(db, current_user.id, today=today, days=days, tz=tz)

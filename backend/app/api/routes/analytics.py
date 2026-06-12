"""Analytics route. Thin handler — delegates aggregation to the service."""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.analytics import AnalyticsSummary
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _today_for(user: User) -> tuple[date, str]:
    tz = user.timezone or "UTC"
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        tz, zone = "UTC", ZoneInfo("UTC")
    return datetime.now(zone).date(), tz


@router.get("", response_model=AnalyticsSummary)
def get_analytics(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalyticsSummary:
    today, tz = _today_for(current_user)
    return analytics_service.get_analytics(db, current_user.id, today=today, tz=tz)

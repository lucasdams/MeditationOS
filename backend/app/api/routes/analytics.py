"""Analytics route. Thin handler — delegates aggregation to the service."""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email, today_for_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.analytics import AnalyticsSummary, InsightsResponse
from app.services import analytics_service, insights_service

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_verified_email)],
)


@router.get("", response_model=AnalyticsSummary)
def get_analytics(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> AnalyticsSummary:
    today, tz = today_tz
    return analytics_service.get_analytics(db, current_user.id, today=today, tz=tz)


@router.get("/insights", response_model=InsightsResponse)
def get_insights(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> InsightsResponse:
    today, tz = today_tz
    return insights_service.get_insights(db, current_user.id, today=today, tz=tz)

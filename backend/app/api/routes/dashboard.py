"""Dashboard routes. Thin handler — delegates aggregation to the service."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user, require_verified_email, today_for_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.dashboard import ActivityCalendar, DashboardStats
from app.schemas.weekly_review import WeeklyReview
from app.services import dashboard_service, weekly_review_service

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_verified_email)],
)


@router.get("/stats", response_model=DashboardStats)
def get_stats(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> DashboardStats:
    today, tz = today_tz
    return dashboard_service.get_stats(
        db,
        current_user.id,
        today=today,
        tz=tz,
        quest_features=current_user.quest_features,
    )


@router.get("/weekly-review", response_model=WeeklyReview)
def get_weekly_review(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> WeeklyReview:
    today, tz = today_tz
    return weekly_review_service.get_weekly_review(db, current_user.id, today=today, tz=tz)


@router.get("/activity", response_model=ActivityCalendar)
def get_activity(
    days: int = Query(365, ge=1, le=366),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    today_tz: tuple[date, str] = Depends(today_for_user),
) -> ActivityCalendar:
    today, tz = today_tz
    return dashboard_service.get_activity(db, current_user.id, today=today, days=days, tz=tz)

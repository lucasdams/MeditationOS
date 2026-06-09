"""Dashboard aggregate response schemas."""

from datetime import date

from pydantic import BaseModel


class DailyTotal(BaseModel):
    date: date
    seconds: int


class DashboardStats(BaseModel):
    total_seconds: int
    session_count: int
    current_streak_days: int
    longest_streak_days: int
    xp: int
    level: int
    xp_into_level: int
    xp_for_next_level: int
    this_week: list[DailyTotal]

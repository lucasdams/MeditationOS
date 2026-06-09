"""Dashboard aggregate response schemas."""

from datetime import date

from pydantic import BaseModel


class DailyTotal(BaseModel):
    date: date
    seconds: int


class DashboardStats(BaseModel):
    total_seconds: int
    session_count: int
    this_week: list[DailyTotal]

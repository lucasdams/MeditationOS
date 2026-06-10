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
    gratitude_count: int = 0


class ActivityCalendar(BaseModel):
    """A year of daily practice for a GitHub-style heatmap.

    `days` is sparse — only days with at least one session — and the client
    fills the grid for the `start`..`end` range.
    """

    start: date
    end: date
    days: list[DailyTotal]

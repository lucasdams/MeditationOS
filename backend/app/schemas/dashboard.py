"""Dashboard aggregate response schemas."""

from datetime import date

from pydantic import BaseModel


class DailyTotal(BaseModel):
    date: date
    seconds: int


class QuestStatus(BaseModel):
    key: str  # the activity category (meditate/breathe/gratitude/journal)
    variant: str  # which rotating quest within the category is up today
    label: str
    xp: int
    done: bool


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
    streak_bonus_xp: int = 0
    daily_quests: list[QuestStatus] = []


class ActivityDay(BaseModel):
    """One active day in the heatmap. `all_quests` drives the 3-state colouring:
    inactive (not present) / active (present) / all daily quests completed."""

    date: date
    seconds: int
    all_quests: bool


class ActivityCalendar(BaseModel):
    """A year of daily practice for a GitHub-style heatmap.

    `days` is sparse — only days with at least one session — and the client
    fills the grid for the `start`..`end` range.
    """

    start: date
    end: date
    days: list[ActivityDay]

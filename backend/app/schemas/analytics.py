"""Analytics response schemas — aggregates over the user's practice + journal data."""

from datetime import date

from pydantic import BaseModel


class TypeBreakdown(BaseModel):
    type: str
    count: int
    minutes: int


class WeekdayCount(BaseModel):
    weekday: int  # 0 = Sunday … 6 = Saturday (Postgres dow)
    count: int


class TimeBucketCount(BaseModel):
    bucket: str  # morning | afternoon | evening | night
    count: int


class WeekMinutes(BaseModel):
    week_start: date  # Monday of the week (user's local week)
    minutes: int


class MoodCount(BaseModel):
    mood: str
    count: int


class WeekMoods(BaseModel):
    week_start: date  # Monday of the week (user's local week)
    counts: dict[str, int]  # mood -> number of journal entries that week


class AnalyticsSummary(BaseModel):
    total_sessions: int
    total_minutes: int
    days_practiced: int  # distinct local days with a session
    by_type: list[TypeBreakdown]
    by_weekday: list[WeekdayCount]  # 7 entries, zero-filled (Sun → Sat)
    by_time_of_day: list[TimeBucketCount]  # 4 entries, ordered
    minutes_by_week: list[WeekMinutes]  # last N weeks, zero-filled, oldest → newest
    moods: list[MoodCount]  # journal mood distribution
    mood_by_week: list[WeekMoods]  # last N weeks of journal moods, oldest → newest

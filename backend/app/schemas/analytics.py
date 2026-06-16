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


class Insight(BaseModel):
    """A single gentle, honest observation about the user's practice.

    `kind` is a stable machine key (for the frontend to pick an icon/order);
    `title` and `detail` are user-facing copy; `basis` states the sample it rests
    on ("based on 23 rated sessions") so observations stay credible, not clinical.
    """

    kind: str
    title: str
    detail: str
    basis: str


class InsightsResponse(BaseModel):
    insights: list[Insight]
    # True when there isn't yet enough data for any honest pattern — the frontend
    # shows an encouraging "patterns appear soon" state instead of empty silence.
    needs_more_data: bool


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

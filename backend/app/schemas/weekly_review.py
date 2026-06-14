"""Weekly review — a reflective summary of the last 7 local days, computed on read."""

from datetime import date

from pydantic import BaseModel


class WeeklyReview(BaseModel):
    start: date
    end: date
    minutes: int  # practice minutes this week
    last_week_minutes: int  # the 7 days before that, for a simple comparison
    sessions: int
    active_days: int  # distinct days practiced this week (0–7)
    current_streak_days: int
    longest_session_seconds: int  # the longest single sit this week
    top_mood: str | None  # most-logged mood this week (mood check-ins + journal moods)
    mood_counts: dict[str, int]

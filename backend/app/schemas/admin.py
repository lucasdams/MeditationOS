"""Admin metrics response schemas.

Aggregate business metrics ONLY — counts, sums, and distributions across the whole
user base. No individual user's private content (journal/gratitude bodies, biometric
values, mood text) is ever represented here; every field is a number.
"""

from datetime import date

from pydantic import BaseModel


class DailyCount(BaseModel):
    """One day of a time series (e.g. signups per day)."""

    day: date
    count: int


class UserMetrics(BaseModel):
    total: int
    guests: int
    registered: int  # non-guest accounts
    email_verified: int
    email_unverified: int
    with_active_streak: int  # practiced today or yesterday (UTC) — see admin_service
    signups_last_30_days: list[DailyCount]  # zero-filled, oldest → newest


class ActiveUserMetrics(BaseModel):
    """Distinct users with at least one session in the trailing window."""

    dau: int  # last 1 day
    wau: int  # last 7 days
    mau: int  # last 30 days


class PracticeMetrics(BaseModel):
    total_sessions: int
    total_minutes: int


class ContentMetrics(BaseModel):
    """Counts of user-generated rows. Counts only — never any body text."""

    gratitude_entries: int
    journal_entries: int
    mood_logs: int


class AdoptionMetrics(BaseModel):
    """How many users have adopted optional surfaces (distinct user counts)."""

    sanctuary_users: int  # users with ≥1 sanctuary planting
    goal_users: int  # users with ≥1 goal
    reminder_users: int  # users with the daily reminder enabled
    push_users: int  # users with ≥1 push subscription


class AdminMetrics(BaseModel):
    """Top-level admin dashboard payload — aggregate business metrics."""

    generated_at: date  # UTC date the snapshot was computed
    users: UserMetrics
    active_users: ActiveUserMetrics
    practice: PracticeMetrics
    content: ContentMetrics
    adoption: AdoptionMetrics

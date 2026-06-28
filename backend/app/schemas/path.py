"""Path request/response schemas.

A Path's per-day status is DERIVED from logged activity (see `path_service`), never stored,
so these are read-only response shapes — there is no create/update body. Enrolling takes no
body (the path id is a URL parameter), so there is no request schema either.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel

# A day's derived state: completed, the current (next) day to do, or still locked ahead.
PathDayState = Literal["done", "current", "locked"]
# What practice a day asks for. Mirrors paths_catalog.PathPractice.
PathPractice = Literal["breathe", "meditate", "gratitude"]


class PathDayStatus(BaseModel):
    """One day of a path, with its derived status for the current user."""

    index: int  # 1-based position in the path
    title: str
    practice: PathPractice
    min_minutes: int
    cue: str
    status: PathDayState


class PathSummary(BaseModel):
    """A path plus the current user's derived progress through it.

    For a path the user is NOT enrolled in: `enrolled` is false, `started_on`/`current_day`
    are null, `completed` is false, `completed_days` is 0, and every day's status is "locked".
    """

    id: str
    title: str
    blurb: str
    total_days: int
    enrolled: bool
    started_on: date | None
    # 1-based index of the day the user is on. Null if not enrolled OR if the path is complete.
    current_day: int | None
    completed: bool
    completed_days: int
    days: list[PathDayStatus]


class PathList(BaseModel):
    """The catalog with the current user's progress folded into each path."""

    paths: list[PathSummary]

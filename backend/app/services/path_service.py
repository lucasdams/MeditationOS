"""Path derivation — read-only, computed entirely from the user's logged activity.

Enrolling stores only `(user_id, path_id, started_on)` (see `app/models/path_enrollment.py`).
Every day's status (done / current / locked) and the user's current day are DERIVED here from
the immutable activity log — nothing about progress is written down. This is the load-bearing
rule (ADR-0009 / docs/beginner-first-revision.md §8): completion can't be gamed and can't drift
from real sessions.

The derivation, day by day in order:

  - `last_done_date` starts at `started_on − 1 day`.
  - For each day, find the EARLIEST calendar date (in the user's timezone) STRICTLY AFTER
    `last_done_date` on which a *qualifying* activity exists:
      breathe   → a breathing session (resonance/energizing) with duration ≥ min_minutes·60
      meditate  → a non-breathing session with duration ≥ min_minutes·60
      gratitude → any gratitude entry that date (min_minutes ignored)
    If found → the day is `done`, `last_done_date` advances to that date, continue.
    Else     → this day is `current`, every later day is `locked`, stop.

Because each day must clear a date STRICTLY AFTER the previous day's completion date, at most
one path-day can complete per calendar day, and a missing day never fails the path — it simply
waits at the current day. Session-type classification and timezone/local-date bucketing reuse
the exact dashboard/quest conventions (`BREATHING_SESSION_TYPES`, `time_utils.local_date`).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.gratitude import GratitudeEntry
from app.models.path_enrollment import PathEnrollment
from app.models.session import BREATHING_SESSION_TYPES, Session
from app.schemas.path import PathDayStatus, PathSummary
from app.services import paths_catalog
from app.services.paths_catalog import Path
from app.services.time_utils import local_date


def _enrollment(db: DBSession, user_id: uuid.UUID, path_id: str) -> PathEnrollment | None:
    """The user's enrollment in this path, or None. Scoped to the caller."""
    return db.execute(
        select(PathEnrollment).where(
            PathEnrollment.user_id == user_id, PathEnrollment.path_id == path_id
        )
    ).scalar_one_or_none()


def enroll(
    db: DBSession, user_id: uuid.UUID, path_id: str, *, today: date, tz: str
) -> PathSummary:
    """Enroll the user in `path_id` (or reset an existing enrollment's start to today), then
    return the derived summary. Raises KeyError if the path id is unknown (mapped to 404 in
    the route). One row per (user, path): a re-enroll updates `started_on`, never duplicates.
    """
    path = paths_catalog.get_path(path_id)
    if path is None:
        raise KeyError(path_id)

    existing = _enrollment(db, user_id, path_id)
    if existing is None:
        existing = PathEnrollment(user_id=user_id, path_id=path_id, started_on=today)
        db.add(existing)
    else:
        existing.started_on = today  # re-enroll resets the clock to today
    db.commit()
    db.refresh(existing)

    return _summarize(db, user_id, path, existing, tz=tz)


def list_paths(
    db: DBSession, user_id: uuid.UUID, *, tz: str
) -> list[PathSummary]:
    """Every catalog path, each folded with the current user's derived progress."""
    enrollments = {
        e.path_id: e
        for e in db.execute(
            select(PathEnrollment).where(PathEnrollment.user_id == user_id)
        ).scalars()
    }
    return [
        _summarize(db, user_id, path, enrollments.get(path.id), tz=tz)
        for path in paths_catalog.all_paths()
    ]


def _max_session_minutes_by_day(
    db: DBSession, user_id: uuid.UUID, *, breathing: bool, tz: str
) -> dict[date, int]:
    """For each local day, the longest single qualifying session's whole minutes.

    `breathing=True` looks at breathing sessions (resonance/energizing), else non-breathing
    meditation sessions — matching how the dashboard/quests classify session types. We key on
    the MAX duration because a path day asks for one session that clears `min_minutes`; the
    longest session on a day decides whether any single session qualifies.
    """
    day = local_date(tz, Session.occurred_at)
    type_filter = (
        Session.type.in_(BREATHING_SESSION_TYPES)
        if breathing
        else Session.type.notin_(BREATHING_SESSION_TYPES)
    )
    rows = db.execute(
        select(day, func.max(Session.duration_seconds))
        .where(Session.user_id == user_id, type_filter)
        .group_by(day)
    ).all()
    return {row[0]: int(row[1]) // 60 for row in rows}


def _gratitude_days(db: DBSession, user_id: uuid.UUID, *, tz: str) -> set[date]:
    """Local days on which the user logged at least one gratitude entry."""
    day = local_date(tz, GratitudeEntry.created_at)
    rows = db.execute(
        select(day).where(GratitudeEntry.user_id == user_id).distinct()
    ).all()
    return {row[0] for row in rows}


def _summarize(
    db: DBSession,
    user_id: uuid.UUID,
    path: Path,
    enrollment: PathEnrollment | None,
    *,
    tz: str,
) -> PathSummary:
    """Derive the per-day status + current day for `path` from the user's activity.

    For a non-enrolled path every day is `locked` (and `current_day` is null). For an enrolled
    path we walk the days in order, requiring each to be satisfied by a date strictly after the
    previous day's completion (so ≤1 day completes per calendar day and missing days only wait).
    """
    if enrollment is None:
        days = [
            PathDayStatus(
                index=d.index,
                title=d.title,
                practice=d.practice,
                min_minutes=d.min_minutes,
                cue=d.cue,
                status="locked",
            )
            for d in path.days
        ]
        return PathSummary(
            id=path.id,
            title=path.title,
            blurb=path.blurb,
            total_days=path.total_days,
            enrolled=False,
            started_on=None,
            current_day=None,
            completed=False,
            completed_days=0,
            days=days,
        )

    # Activity, bucketed by the user's local calendar date. Pulled once, walked in Python.
    breathe_minutes = _max_session_minutes_by_day(db, user_id, breathing=True, tz=tz)
    meditate_minutes = _max_session_minutes_by_day(db, user_id, breathing=False, tz=tz)
    gratitude_days = _gratitude_days(db, user_id, tz=tz)

    def qualifying_date(practice: str, min_minutes: int, after: date) -> date | None:
        """The earliest local date strictly after `after` that satisfies this day."""
        if practice == "gratitude":
            candidates = gratitude_days
            ok = lambda d: True  # noqa: E731 — a gratitude moment qualifies regardless of length
        elif practice == "breathe":
            candidates = breathe_minutes
            ok = lambda d: breathe_minutes[d] >= min_minutes  # noqa: E731
        else:  # "meditate"
            candidates = meditate_minutes
            ok = lambda d: meditate_minutes[d] >= min_minutes  # noqa: E731
        future = (d for d in candidates if d > after and ok(d))
        return min(future, default=None)

    last_done_date = enrollment.started_on - timedelta(days=1)
    statuses: list[str] = []
    completed_days = 0
    current_day: int | None = None

    for d in path.days:
        if current_day is not None:
            statuses.append("locked")  # everything after the current day is locked
            continue
        hit = qualifying_date(d.practice, d.min_minutes, last_done_date)
        if hit is not None:
            statuses.append("done")
            completed_days += 1
            last_done_date = hit
        else:
            statuses.append("current")
            current_day = d.index

    completed = completed_days == path.total_days
    days = [
        PathDayStatus(
            index=d.index,
            title=d.title,
            practice=d.practice,
            min_minutes=d.min_minutes,
            cue=d.cue,
            status=status,
        )
        for d, status in zip(path.days, statuses, strict=True)
    ]
    return PathSummary(
        id=path.id,
        title=path.title,
        blurb=path.blurb,
        total_days=path.total_days,
        enrolled=True,
        started_on=enrollment.started_on,
        # current_day is null when complete (no day is "current") — matches the contract.
        current_day=current_day,
        completed=completed,
        completed_days=completed_days,
        days=days,
    )

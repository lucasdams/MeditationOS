"""Seed a rich demo account so the whole app can be shown/tested with realistic data.

Run (inside the backend container):

    docker compose exec -T backend python -m scripts.seed_demo

This is a **dev/QA tool**. It is never imported by the app and never runs
automatically. It refuses to touch a production database (see `_guard_environment`).

What it seeds for the demo user (`demo@meditationos.app`):
  * ~6 weeks of meditation + resonance-breathing sessions (varied length / time of
    day), with a live recent streak — so streaks, the weekly view, the heatmap, and
    analytics all look populated.
  * Journals with varied moods, a few linked to sessions.
  * Gratitude entries across several categories.
  * A couple of active goals.

Idempotent: re-running deletes the demo user's owned rows and re-seeds, so there are
no duplicates and no crash. Timestamps are written explicitly (past data does not
depend on "now"), bucketed into the user's local days.
"""

import argparse
import random
import sys
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.goal import Goal, GoalCheckin
from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import Session as PracticeSession
from app.models.user import QUEST_FEATURES, User

DEMO_EMAIL = "demo@meditationos.app"
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demodemo123"  # noqa: S105 — a fixed, well-known DEV-ONLY credential
DEMO_TZ = "UTC"

# How far back the practice history runs.
WEEKS_OF_HISTORY = 6
# The most recent N days are guaranteed to have a session, so the dashboard shows a
# live, unbroken streak.
RECENT_STREAK_DAYS = 9

_rng = random.Random(20240614)  # deterministic output across runs


def _guard_environment(force: bool) -> None:
    """Refuse to run against anything that looks like production.

    The app distinguishes envs via `ENVIRONMENT` (app/core/config.py). We only allow
    development / test / local, unless `--force` is explicitly passed.
    """
    env = (settings.environment or "").lower()
    allowed = {"development", "dev", "test", "local"}
    if env in allowed or force:
        return
    print(
        f"Refusing to seed: ENVIRONMENT={settings.environment!r} is not one of "
        f"{sorted(allowed)}. Pass --force to override (NEVER do this on production).",
        file=sys.stderr,
    )
    sys.exit(2)


def _reset_demo_user(db: DBSession) -> User:
    """Create the demo user, or wipe its owned data if it already exists.

    Idempotency: we keep the same user row (so its id / created_at are stable) but
    delete everything it owns, then re-seed from scratch — no duplicates on re-run.
    """
    user = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
    if user is None:
        user = User(
            email=DEMO_EMAIL,
            username=DEMO_USERNAME,
            password_hash=hash_password(DEMO_PASSWORD),
            email_verified=True,
            timezone=DEMO_TZ,
            quest_features=list(QUEST_FEATURES),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    # Existing demo account — refresh credentials and clear owned data.
    user.password_hash = hash_password(DEMO_PASSWORD)
    user.username = DEMO_USERNAME
    user.email_verified = True
    user.timezone = DEMO_TZ
    user.quest_features = list(QUEST_FEATURES)
    for model in (
        GoalCheckin,
        Goal,
        Journal,
        GratitudeEntry,
        PracticeSession,
    ):
        db.execute(delete(model).where(model.user_id == user.id))
    db.commit()
    db.refresh(user)
    return user


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    """A tz-aware UTC timestamp for `day` at the given local (UTC) time of day."""
    return datetime.combine(day, time(hour, minute), tzinfo=UTC)


def _seed_sessions(db: DBSession, user: User, today: date) -> list[PracticeSession]:
    """~6 weeks of sessions with a guaranteed recent streak.

    Mix of mindfulness and resonance_breathing, varied durations and times of day.
    Timestamps are written explicitly so the history doesn't depend on "now".
    """
    sessions: list[PracticeSession] = []
    start = today - timedelta(weeks=WEEKS_OF_HISTORY)

    # Times of day to scatter sessions across (morning / midday / evening).
    slots = [(7, 15), (12, 30), (18, 45), (21, 0)]
    breathing_paces = [(4, 6), (5, 5), (6, 6), (4, 4)]  # (inhale, exhale) seconds

    day = start
    while day <= today:
        days_ago = (today - day).days
        in_recent_streak = days_ago < RECENT_STREAK_DAYS
        # Older history is intermittent (~70% of days); the recent run is unbroken.
        practiced = in_recent_streak or _rng.random() < 0.7
        if not practiced:
            day += timedelta(days=1)
            continue

        # One, occasionally two, sessions on a practiced day.
        n_sessions = 2 if _rng.random() < 0.25 else 1
        chosen_slots = _rng.sample(slots, k=min(n_sessions, len(slots)))
        for hour, minute in chosen_slots:
            occurred = _at(day, hour, minute)
            if _rng.random() < 0.45:
                inhale, exhale = _rng.choice(breathing_paces)
                cycle_secs = inhale + exhale
                duration = _rng.choice([180, 300, 420, 600])
                sessions.append(
                    PracticeSession(
                        user_id=user.id,
                        type="resonance_breathing",
                        duration_seconds=duration,
                        occurred_at=occurred,
                        notes=_rng.choice(
                            [None, "Felt calmer afterwards.", "Good resonance today."]
                        ),
                        focus=_rng.choice([None, 3, 4, 5]),
                        calm=_rng.choice([3, 4, 5]),
                        inhale_seconds=inhale,
                        exhale_seconds=exhale,
                        cycles_completed=duration // cycle_secs,
                        created_at=occurred,
                    )
                )
            else:
                duration = _rng.choice([300, 600, 900, 1200])
                sessions.append(
                    PracticeSession(
                        user_id=user.id,
                        type="mindfulness",
                        duration_seconds=duration,
                        occurred_at=occurred,
                        notes=_rng.choice(
                            [None, "Mind wandered but came back.", "Settled quickly."]
                        ),
                        focus=_rng.choice([None, 3, 4, 5]),
                        calm=_rng.choice([None, 3, 4, 5]),
                        created_at=occurred,
                    )
                )
        day += timedelta(days=1)

    db.add_all(sessions)
    db.commit()
    return sessions


def _seed_journals(db: DBSession, user: User, sessions: list[PracticeSession]) -> None:
    """Varied moods; a few linked to a session (created at that session's time)."""
    moods = ["calm", "content", "focused", "grateful", "neutral", "restless", "tired"]
    bodies = [
        "Noticed the urge to check my phone and let it pass.",
        "A busy day, but the sit gave me a pocket of quiet.",
        "Grateful for a slow morning and warm coffee.",
        "Restless mind today — still showed up, that's what counts.",
        "The breathing pace felt natural; shoulders dropped.",
        "Reflecting on a hard conversation and how I want to respond.",
        "Small wins: stretched, breathed, smiled at a stranger.",
        "Felt scattered, but ten minutes brought me back.",
        "Tired tonight; a short sit was enough.",
        "Content with how the week is shaping up.",
    ]
    # Link a few journals to recent sessions; leave the rest standalone.
    linkable = sessions[-8:] if len(sessions) >= 8 else sessions
    for i, body in enumerate(bodies):
        linked = i < 4 and i < len(linkable)
        session = linkable[i] if linked else None
        created = (
            session.occurred_at + timedelta(minutes=5)
            if session is not None
            else _at(date.today() - timedelta(days=i * 2), 20, 30)
        )
        db.add(
            Journal(
                user_id=user.id,
                session_id=session.id if session is not None else None,
                body=body,
                mood=moods[i % len(moods)],
                created_at=created,
            )
        )
    db.commit()


def _seed_gratitude(db: DBSession, user: User, today: date) -> None:
    """Entries spread across several categories and recent days."""
    entries = [
        ("people", "My partner made me laugh this morning."),
        ("nature", "The light through the trees on my walk."),
        ("health", "My body carried me through a long day."),
        ("food", "A simple, perfect bowl of soup."),
        ("growth", "I handled stress better than I would have a year ago."),
        ("simple_pleasures", "Clean sheets and an early night."),
        ("friendship", "A friend checked in out of the blue."),
        ("home", "A quiet corner that's just mine."),
        ("learning", "Understood something that confused me yesterday."),
        ("music", "A song that felt like it was written for today."),
        ("mornings", "The first sip of coffee in silence."),
        ("kindness", "Someone let me merge in traffic."),
    ]
    for i, (category, text) in enumerate(entries):
        created = _at(today - timedelta(days=i), _rng.choice([8, 13, 19]), 0)
        db.add(
            GratitudeEntry(
                user_id=user.id,
                category=category,
                text=text,
                created_at=created,
            )
        )
    db.commit()


def _seed_goals(db: DBSession, user: User) -> None:
    """A couple of active goals (one built-in, one custom with check-ins)."""
    meditate_goal = Goal(
        user_id=user.id,
        activity="meditate",
        period="day",
        count=1,
        status="active",
    )
    breathe_goal = Goal(
        user_id=user.id,
        activity="breathe",
        period="week",
        count=3,
        status="active",
    )
    custom_goal = Goal(
        user_id=user.id,
        activity="custom",
        label="Walk outside",
        period="week",
        count=4,
        status="active",
    )
    db.add_all([meditate_goal, breathe_goal, custom_goal])
    db.commit()
    db.refresh(custom_goal)

    # A few recent check-ins on the custom goal so it shows progress.
    today = date.today()
    for offset in (0, 1, 3):
        db.add(
            GoalCheckin(
                goal_id=custom_goal.id,
                user_id=user.id,
                checkin_date=today - timedelta(days=offset),
            )
        )
    db.commit()


def seed(db: DBSession) -> None:
    today = date.today()
    user = _reset_demo_user(db)
    sessions = _seed_sessions(db, user, today)
    _seed_journals(db, user, sessions)
    _seed_gratitude(db, user, today)
    _seed_goals(db, user)

    print("\nDemo data seeded:")
    print(f"  user:      {user.email} (id {user.id})")
    print(f"  sessions:  {len(sessions)}")
    print("  login email:    ", DEMO_EMAIL)
    print("  login password: ", DEMO_PASSWORD)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a rich demo account.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow running even when ENVIRONMENT is not dev/test (NEVER on prod).",
    )
    args = parser.parse_args()

    _guard_environment(args.force)

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()

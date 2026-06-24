"""Admin metrics aggregation.

Computes aggregate business metrics across the whole user base with efficient SQL
(COUNT / SUM / GROUP BY) — no N+1, nothing loaded row-by-row into Python.

PRIVACY: every value returned is a count or a sum. This service never reads or returns
any individual user's private CONTENT (journal/gratitude bodies, biometric values, mood
text). It only touches identity/flag columns (is_guest, email_verified, timestamps) and
aggregates of user-data tables.

Time windows use UTC `created_at` / `occurred_at` (no per-user timezone bucketing) —
appropriate for a business-wide snapshot, and cheap (single grouped queries).
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.goal import Goal
from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.mood_log import MoodLog
from app.models.push_subscription import PushSubscription
from app.models.session import Session
from app.models.user import User
from app.schemas.admin import (
    ActiveUserMetrics,
    AdminMetrics,
    AdoptionMetrics,
    ContentMetrics,
    DailyCount,
    PracticeMetrics,
    UserMetrics,
)

SIGNUP_WINDOW_DAYS = 30


def _signups_last_30_days(db: DBSession, *, today: date) -> list[DailyCount]:
    """New-user counts per UTC day over the trailing 30 days, zero-filled oldest→newest."""
    start = today - timedelta(days=SIGNUP_WINDOW_DAYS - 1)
    # Pin to UTC so the bucketing is consistent regardless of the DB session timezone.
    signup_day = func.date(func.timezone("UTC", User.created_at))
    counts = {
        d: c
        for d, c in db.execute(
            select(signup_day, func.count())
            .where(signup_day >= start)
            .group_by(signup_day)
        )
    }
    days = [start + timedelta(days=i) for i in range(SIGNUP_WINDOW_DAYS)]
    return [DailyCount(day=d, count=int(counts.get(d, 0))) for d in days]


def _distinct_session_users_since(db: DBSession, since: datetime) -> int:
    """Distinct users with at least one session whose occurred_at is >= `since`."""
    return int(
        db.execute(
            select(func.count(func.distinct(Session.user_id))).where(
                Session.occurred_at >= since
            )
        ).scalar_one()
    )


def _distinct_users(db: DBSession, model) -> int:
    """Distinct user_id count for a user-owned table (adoption metric)."""
    return int(
        db.execute(select(func.count(func.distinct(model.user_id)))).scalar_one()
    )


def get_admin_metrics(db: DBSession, *, now: datetime | None = None) -> AdminMetrics:
    now = now or datetime.now(UTC)
    today = now.date()

    # ── Users (single grouped pass over identity/flag columns) ──────────────
    total, guests, verified = db.execute(
        select(
            func.count(),
            func.count().filter(User.is_guest.is_(True)),
            func.count().filter(User.email_verified.is_(True)),
        )
    ).one()
    total, guests, verified = int(total), int(guests), int(verified)

    # "Active streak" — defined for this aggregate as: practiced (≥1 session) today or
    # yesterday in UTC. A pragmatic, single-query proxy for the per-user streak the
    # dashboard computes (which needs each user's full local-day history + grace logic);
    # it deliberately avoids loading every user's sessions. Documented in the PR.
    streak_cutoff = datetime.combine(today - timedelta(days=1), datetime.min.time(), UTC)
    with_active_streak = _distinct_session_users_since(db, streak_cutoff)

    users = UserMetrics(
        total=total,
        guests=guests,
        registered=total - guests,
        email_verified=verified,
        email_unverified=total - verified,
        with_active_streak=with_active_streak,
        signups_last_30_days=_signups_last_30_days(db, today=today),
    )

    # ── Active users (DAU/WAU/MAU) from session activity ────────────────────
    active_users = ActiveUserMetrics(
        dau=_distinct_session_users_since(db, now - timedelta(days=1)),
        wau=_distinct_session_users_since(db, now - timedelta(days=7)),
        mau=_distinct_session_users_since(db, now - timedelta(days=30)),
    )

    # ── Practice totals ─────────────────────────────────────────────────────
    total_seconds, total_sessions = db.execute(
        select(func.coalesce(func.sum(Session.duration_seconds), 0), func.count())
    ).one()
    practice = PracticeMetrics(
        total_sessions=int(total_sessions),
        total_minutes=int(total_seconds) // 60,
    )

    # ── Content counts (rows only — never any body text) ────────────────────
    content = ContentMetrics(
        gratitude_entries=int(
            db.execute(select(func.count()).select_from(GratitudeEntry)).scalar_one()
        ),
        journal_entries=int(
            db.execute(select(func.count()).select_from(Journal)).scalar_one()
        ),
        mood_logs=int(
            db.execute(select(func.count()).select_from(MoodLog)).scalar_one()
        ),
    )

    # ── Adoption (distinct users per optional surface) ──────────────────────
    adoption = AdoptionMetrics(
        goal_users=_distinct_users(db, Goal),
        reminder_users=int(
            db.execute(
                select(func.count()).select_from(User).where(User.reminder_enabled.is_(True))
            ).scalar_one()
        ),
        push_users=_distinct_users(db, PushSubscription),
    )

    return AdminMetrics(
        generated_at=today,
        users=users,
        active_users=active_users,
        practice=practice,
        content=content,
        adoption=adoption,
    )

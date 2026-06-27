"""Pick a journaling prompt contextual to the user's recent practice.

This is the data-first journaling nudge: instead of a flat daily pool, the prompt
is tuned to what the user just did — a reflective beat at a streak milestone, or a
prompt that fits their last session's type (a breathing sit vs a loving-kindness
sit). When there's no usable context (no sessions yet) it falls back to a generic
prompt, so the nudge is never empty.

Everything is computed from the user's own data, scoped to the user, read-only.
Prompt copy is versioned in `app/prompts/journal.py` — this module only *selects*.

Determinism: within a single local day the pick is stable (same context → same
prompt), so the nudge doesn't flicker on reload. The day-stable index reuses the
ordinal of `today`, mirroring the frontend's `dailyOf` helper.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.session import BREATHING_SESSION_TYPES, Session
from app.prompts import journal as prompts
from app.schemas.journal import JournalPromptRead
from app.services.time_utils import MIN_PRACTICE_SECONDS, compute_streaks, local_date


def _daily_pick(
    pool: tuple[prompts.ContextualPrompt, ...], today: date
) -> prompts.ContextualPrompt:
    """A stable-per-day choice from a non-empty pool (no flicker within a day)."""
    return pool[today.toordinal() % len(pool)]


def _current_streak(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> int:
    """The user's current practice-day streak, computed exactly like the dashboard.

    A day counts as practice only once its total session time reaches
    MIN_PRACTICE_SECONDS, so a 1-second sit can't fabricate a streak milestone.
    """
    local_day = local_date(tz, Session.occurred_at)
    days = {
        row[0]
        for row in db.execute(
            select(local_day)
            .where(Session.user_id == user_id)
            .group_by(local_day)
            .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
        )
    }
    current, _longest, _rest = compute_streaks(days, today)
    return current


def _last_session_type(db: DBSession, user_id: uuid.UUID) -> str | None:
    """The `type` of the user's most recent session, or None if they have none.

    Ordered by `occurred_at` (the when-it-happened time the user reports), so a
    back-dated log doesn't masquerade as the latest sit.
    """
    return db.execute(
        select(Session.type)
        .where(Session.user_id == user_id)
        .order_by(Session.occurred_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _pool_for_type(session_type: str) -> tuple[prompts.ContextualPrompt, ...]:
    if session_type in BREATHING_SESSION_TYPES:
        return prompts.AFTER_BREATHING
    if session_type == "loving_kindness":
        return prompts.AFTER_LOVING_KINDNESS
    return prompts.AFTER_MEDITATION


def get_prompt(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str
) -> JournalPromptRead:
    """Select today's journaling prompt for the user.

    Priority: a streak milestone (7/30/100 days) outranks a last-session-type
    prompt, since hitting a milestone is the more salient moment; otherwise the
    prompt is tuned to the last session's type; otherwise a generic fallback.
    """
    # Streak milestone takes precedence — surface the largest one the user has reached.
    streak = _current_streak(db, user_id, today=today, tz=tz)
    for milestone in prompts.STREAK_MILESTONE_DAYS:
        if streak >= milestone:
            pick = _daily_pick(prompts.STREAK_MILESTONE[milestone], today)
            return JournalPromptRead(text=pick.text, context=pick.context, contextual=True)

    # Otherwise tune to the last session's type, when there is one.
    last_type = _last_session_type(db, user_id)
    if last_type is not None:
        pick = _daily_pick(_pool_for_type(last_type), today)
        return JournalPromptRead(text=pick.text, context=pick.context, contextual=True)

    # No usable context — fall back to a generic daily prompt.
    pick = _daily_pick(prompts.GENERIC, today)
    return JournalPromptRead(text=pick.text, context=pick.context, contextual=False)

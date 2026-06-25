"""Dashboard aggregates, computed from `sessions` by SQL (not Python loops).

Streaks, daily quests, the heatmap, and the weekly view are computed from the
distinct calendar dates of `occurred_at` in the **user's timezone** (Postgres
`timezone(tz, ...)`), so the day rolls over at the user's local midnight. Not stored.
"""

import uuid
from datetime import date, timedelta
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.session import Session
from app.models.user import QUEST_FEATURES
from app.schemas.dashboard import (
    ActivityCalendar,
    ActivityDay,
    DailyTotal,
    DashboardStats,
    QuestStatus,
)
from app.services.gratitude_service import GRATITUDE_XP
from app.services.journal_service import JOURNAL_XP
from app.services.quest_pool import categories_for_day, quest_for
from app.services.time_utils import MIN_PRACTICE_SECONDS, compute_streaks, local_date

# Back-compat aliases: streak/local-day logic (and MIN_PRACTICE_SECONDS) now live in
# `time_utils`; other modules historically import these names from here. Re-exported so
# those imports keep working.
_compute_streaks = compute_streaks
_local_date = local_date

# XP per *effective* minute of practice. Meditation (non-breathing) pays
# MEDITATION_XP_PER_MIN; resonance breathing — the harder, signature practice — pays the
# higher BREATHING_XP_MULTIPLIER per effective minute (kept strictly above meditation).
# "Effective" minutes apply a front-loaded, concave curve PER SESSION (see XP_TIER_*
# below), so the first minutes of a sit are worth the most and each extra minute less.
MEDITATION_XP_PER_MIN = 2
BREATHING_XP_MULTIPLIER = 3  # XP per effective minute of resonance breathing

# Front-loaded practice-XP curve (per session). A session's raw whole minutes are mapped
# to a smaller number of "effective minutes" via a concave, piecewise-tiered rate, so a
# single very long sit earns much less than the same time split across several sits.
# Marginal value strictly decreases as a session lengthens. The two breakpoints and the
# two reduced rates are the tunable knobs; the first tier is always full value.
#
#   minutes in [0, XP_TIER1_MINUTES)                -> 1.0  eff min / raw min (full)
#   minutes in [XP_TIER1_MINUTES, XP_TIER2_MINUTES) -> XP_TIER2_RATE   (e.g. 0.5)
#   minutes >= XP_TIER2_MINUTES                     -> XP_TIER3_RATE   (e.g. 0.25)
#
# Worked single-session examples (meditation @2/eff-min, breathing @3/eff-min):
#   10 min  -> 10.0 eff -> 20 XP med / 30 XP breath   (unchanged vs the old linear curve)
#   30 min  -> 25.0 eff -> 50 XP med / 75 XP breath
#   60 min  -> 35.0 eff -> 70 XP med / 105 XP breath
#  120 min  -> 50.0 eff -> 100 XP med / 150 XP breath  (< 2× the 60-min value)
# Splitting practice across sessions beats one giant sit: e.g. two 30-min meditations
# earn 2×50 = 100 XP, where a single 60-min sit earns only 70 XP.
XP_TIER1_MINUTES = 20  # full-value minutes per session
XP_TIER2_MINUTES = 40  # end of the half-rate band; beyond this is the lowest rate
XP_TIER2_RATE = 0.5  # effective minutes per raw minute in the second band
XP_TIER3_RATE = 0.25  # effective minutes per raw minute beyond the second band


def _effective_minutes(minutes: int) -> float:
    """Concave (front-loaded) map of raw whole minutes -> effective minutes, per session.

    Monotonic non-decreasing, with a strictly decreasing marginal rate across the tier
    boundaries: more time never lowers XP, but each extra minute is worth less.
    """
    eff = float(min(minutes, XP_TIER1_MINUTES))
    if minutes > XP_TIER1_MINUTES:
        eff += min(minutes - XP_TIER1_MINUTES, XP_TIER2_MINUTES - XP_TIER1_MINUTES) * XP_TIER2_RATE
    if minutes > XP_TIER2_MINUTES:
        eff += (minutes - XP_TIER2_MINUTES) * XP_TIER3_RATE
    return eff


def _practice_xp(sessions: list[tuple[int, bool]]) -> int:
    """Total practice XP across a user's sessions, front-loaded PER SESSION.

    `sessions` is a list of (duration_seconds, is_breathing). Each session is floored to
    whole minutes (a sub-minute sit earns 0), run through the concave `_effective_minutes`
    curve, then paid at the meditation or breathing rate. Summed across sessions and
    floored to a non-negative integer.
    """
    total = 0.0
    for duration_seconds, is_breathing in sessions:
        minutes = int(duration_seconds) // 60
        if minutes <= 0:
            continue
        rate = BREATHING_XP_MULTIPLIER if is_breathing else MEDITATION_XP_PER_MIN
        total += _effective_minutes(minutes) * rate
    return int(total)
# Bonus XP per day of your current streak (grows as you keep it up, falls if it lapses).
STREAK_BONUS_PER_DAY = 10
# A meditation only "counts" for the meditate quest once the day's total reaches this,
# so a spammed 1-second sit earns nothing (mirrors BREATHE_QUEST_SECONDS).
MEDITATE_QUEST_SECONDS = 60
# MIN_PRACTICE_SECONDS (the minimum daily session time that counts as practice) lives in
# `time_utils` and is imported at the top of this module — see the import there.
# Anti-spam: only the first N gratitude / journal entries on any local day earn XP, so
# you can't farm XP by posting a flood of trivial entries. Genuine daily use is well
# under these; beyond them the entries still save, they just stop paying XP.
GRATITUDE_XP_DAILY_CAP = 5
JOURNAL_XP_DAILY_CAP = 5
# A day with at least this much resonance breathing completes the base breathing quest;
# the "deep breathe" challenge variant asks for DEEP_BREATHE_SECONDS.
BREATHE_QUEST_SECONDS = 60
DEEP_BREATHE_SECONDS = 300
# The "sit 10+ minutes" challenge: a single meditation session of at least this long.
LONG_SIT_SECONDS = 600
# The "slow breathe" challenge: a breathing session paced at ≤5 bpm, i.e. one full
# breath (inhale + exhale) lasting at least this many seconds.
SLOW_BREATH_SECONDS = 12


def _level_progress(xp: int) -> tuple[int, int, int]:
    """Pokémon-style rising curve. XP = minutes practiced.

    Cumulative XP to *reach* level L is 10·L·(L−1) (so each level needs 20·level
    more than the last — quick early levels, slower later). Returns
    (level, xp_into_level, xp_for_next_level).
    """
    level = 1
    while 10 * (level + 1) * level <= xp:  # cumulative XP needed for level+1
        level += 1
    xp_into_level = xp - 10 * level * (level - 1)
    xp_for_next_level = 20 * level
    return level, xp_into_level, xp_for_next_level


def _capped_daily_xp_units(db: DBSession, model, *, user_id: uuid.UUID, tz: str, cap: int) -> int:
    """Sum of per-local-day row counts for `model`, each capped at `cap`. Only the first
    `cap` entries on a day earn XP, so spamming trivial entries stops paying (anti-farm).
    """
    day = _local_date(tz, model.created_at)
    per_day = (
        select(func.least(func.count(model.id), cap).label("c"))
        .where(model.user_id == user_id)
        .group_by(day)
        .subquery()
    )
    return int(db.execute(select(func.coalesce(func.sum(per_day.c.c), 0))).scalar_one())


class _XpBasis(NamedTuple):
    """The shared XP/streak core that funds BOTH the dashboard and the sanctuary wallet.

    `earned_xp` is total XP *minus* the streak bonus (so the wallet balance never drops
    when a streak lapses); `xp` adds the streak bonus back for the dashboard. The day-set
    fields are returned so `get_stats` can build its daily-quest list without re-querying.
    """

    earned_xp: int
    streak_bonus_xp: int
    current_streak: int
    longest_streak: int
    rest_day_used: bool
    cond_days: dict[str, set[date]]
    session_days: set[date]
    gratitude_days: set[date]
    journal_days: set[date]
    gratitude_count: int

    @property
    def xp(self) -> int:
        """Total XP, including the streak bonus — what the dashboard displays."""
        return self.earned_xp + self.streak_bonus_xp


def _xp_basis(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> _XpBasis:
    """Compute the earned XP, streak bonus, and streak — the single source of truth used
    by both `get_stats` (dashboard) and `get_wallet_basis` (sanctuary coins/level). This
    runs the per-session XP curve, the capped gratitude/journal XP, the daily-quest bonus,
    and the streak; it does NOT build the heatmap, this-week, today-count, or quest-list
    blocks that only `get_stats` needs — so the wallet path skips that work entirely.
    """
    # Practice XP is computed PER SESSION (front-loaded curve), so we need each session's
    # duration and whether it's resonance breathing — not a single SUM. Resonance
    # breathing earns extra XP per minute (it's the harder, signature practice).
    practice_rows = db.execute(
        select(Session.duration_seconds, Session.type).where(Session.user_id == user_id)
    ).all()

    # Practice days (for streaks): a day counts only once its total session time reaches
    # MIN_PRACTICE_SECONDS, so a 1-second sit can't keep a streak alive.
    session_local_day = _local_date(tz, Session.occurred_at)
    day_rows = db.execute(
        select(session_local_day)
        .where(Session.user_id == user_id)
        .group_by(session_local_day)
        .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
    ).all()
    session_days = {row[0] for row in day_rows}
    current_streak, longest_streak, rest_day_used = _compute_streaks(session_days, today)

    # Days with a gratitude entry (the "write a gratitude" quest).
    grat_day_rows = db.execute(
        select(_local_date(tz, GratitudeEntry.created_at))
        .where(GratitudeEntry.user_id == user_id)
        .distinct()
    ).all()
    gratitude_days = {row[0] for row in grat_day_rows}
    gratitude_count = int(
        db.execute(
            select(func.count(GratitudeEntry.id)).where(GratitudeEntry.user_id == user_id)
        ).scalar_one()
    )

    # Days with at least a minute of resonance breathing (the "breathe" quest).
    breathing_local_day = _local_date(tz, Session.occurred_at)
    breathing_day_rows = db.execute(
        select(breathing_local_day)
        .where(Session.user_id == user_id, Session.type == "resonance_breathing")
        .group_by(breathing_local_day)
        .having(func.sum(Session.duration_seconds) >= BREATHE_QUEST_SECONDS)
    ).all()
    breathing_days = {row[0] for row in breathing_day_rows}

    # Days with a real meditation (non-breathing) session — the "meditate" quest. Needs
    # at least MEDITATE_QUEST_SECONDS total on the day, so a spammed 1-second "sit" earns
    # nothing. Distinct from "breathe" so a user can opt into either or both.
    meditation_local_day = _local_date(tz, Session.occurred_at)
    meditation_day_rows = db.execute(
        select(meditation_local_day)
        .where(Session.user_id == user_id, Session.type != "resonance_breathing")
        .group_by(meditation_local_day)
        .having(func.sum(Session.duration_seconds) >= MEDITATE_QUEST_SECONDS)
    ).all()
    meditation_days = {row[0] for row in meditation_day_rows}

    # Days with a journal entry — the "journal" quest.
    journal_day_rows = db.execute(
        select(_local_date(tz, Journal.created_at))
        .where(Journal.user_id == user_id)
        .distinct()
    ).all()
    journal_days = {row[0] for row in journal_day_rows}

    # --- Per-day conditions for the rotating quest *challenge* variants ---------
    # Each set holds the local days on which a given variant was satisfied; the keys
    # match Quest.cond in app/services/quest_pool.py. The four base conditions
    # (meditate/breathe/gratitude/journal) reuse the sets computed above.

    # "Sit 10+ minutes": a single non-breathing session ≥ LONG_SIT_SECONDS.
    long_sit_days = {
        r[0]
        for r in db.execute(
            select(_local_date(tz, Session.occurred_at))
            .where(
                Session.user_id == user_id,
                Session.type != "resonance_breathing",
                Session.duration_seconds >= LONG_SIT_SECONDS,
            )
            .distinct()
        ).all()
    }
    # "Meditate twice today": ≥2 non-breathing sessions on the day.
    double_sit_local_day = _local_date(tz, Session.occurred_at)
    double_sit_days = {
        r[0]
        for r in db.execute(
            select(double_sit_local_day)
            .where(Session.user_id == user_id, Session.type != "resonance_breathing")
            .group_by(double_sit_local_day)
            .having(func.count(Session.id) >= 2)
        ).all()
    }
    # "Breathe 5+ minutes": total resonance breathing ≥ DEEP_BREATHE_SECONDS.
    deep_breathe_days = {
        r[0]
        for r in db.execute(
            select(breathing_local_day)
            .where(Session.user_id == user_id, Session.type == "resonance_breathing")
            .group_by(breathing_local_day)
            .having(func.sum(Session.duration_seconds) >= DEEP_BREATHE_SECONDS)
        ).all()
    }
    # "Breathe slow (≤5 bpm)": a breathing session with inhale+exhale ≥ SLOW_BREATH_SECONDS.
    slow_breathe_days = {
        r[0]
        for r in db.execute(
            select(_local_date(tz, Session.occurred_at))
            .where(
                Session.user_id == user_id,
                Session.type == "resonance_breathing",
                Session.inhale_seconds.isnot(None),
                Session.exhale_seconds.isnot(None),
                (Session.inhale_seconds + Session.exhale_seconds) >= SLOW_BREATH_SECONDS,
            )
            .distinct()
        ).all()
    }
    # "Write three gratitudes": ≥3 gratitude entries on the day.
    grat_three_local_day = _local_date(tz, GratitudeEntry.created_at)
    gratitude_three_days = {
        r[0]
        for r in db.execute(
            select(grat_three_local_day)
            .where(GratitudeEntry.user_id == user_id)
            .group_by(grat_three_local_day)
            .having(func.count(GratitudeEntry.id) >= 3)
        ).all()
    }
    # "Journal with a mood": a journal entry carrying a mood tag.
    mood_journal_days = {
        r[0]
        for r in db.execute(
            select(_local_date(tz, Journal.created_at))
            .where(Journal.user_id == user_id, Journal.mood.isnot(None))
            .distinct()
        ).all()
    }

    cond_days = {
        "meditate": meditation_days,
        "long_sit": long_sit_days,
        "double_sit": double_sit_days,
        "breathe": breathing_days,
        "deep_breathe": deep_breathe_days,
        "slow_breathe": slow_breathe_days,
        "gratitude": gratitude_days,
        "gratitude_three": gratitude_three_days,
        "journal": journal_days,
        "mood_journal": mood_journal_days,
    }

    # Daily quests reset each day; total quest XP counts every day a quest was ever
    # completed, so that part only ever grows (each past day's quest is fixed by its
    # date). The streak bonus rides the *current* streak, so it grows as you keep it up
    # and falls back if the streak lapses.
    #
    # The quest the user faces in each category rotates by date (quest_pool.quest_for),
    # and each variant pays its own XP. Earning is independent of which quests the user
    # surfaced — doing the day's activity for any category earns that day's variant's XP.
    # We sum over every day that satisfies ANY quest condition: a day can complete a quest
    # (e.g. a sub-60s slow-breath) without reaching MIN_PRACTICE_SECONDS, so it would be
    # missing from session_days; unioning the cond_days value-sets ensures every such day
    # is scanned for its bonus.
    all_active_days: set[date] = set().union(*cond_days.values())
    quest_bonus_xp = 0
    for day in all_active_days:
        for category in QUEST_FEATURES:
            quest = quest_for(category, day)
            if day in cond_days[quest.cond]:
                quest_bonus_xp += quest.xp
    streak_bonus_xp = current_streak * STREAK_BONUS_PER_DAY

    # Gratitude/journal XP is capped per day (only the first N entries each day pay), so
    # a flood of trivial entries can't farm XP. The displayed totals stay uncapped.
    gratitude_xp_units = _capped_daily_xp_units(
        db, GratitudeEntry, user_id=user_id, tz=tz, cap=GRATITUDE_XP_DAILY_CAP
    )
    journal_xp_units = _capped_daily_xp_units(
        db, Journal, user_id=user_id, tz=tz, cap=JOURNAL_XP_DAILY_CAP
    )

    # Practice XP: each session is run through the front-loaded curve (sub-minute sits
    # earn 0; resonance breathing counts BREATHING_XP_MULTIPLIER×), then summed across
    # sessions — so a long sit is worth progressively less per minute and splitting
    # practice across sessions beats one giant sit. Plus GRATITUDE_XP/JOURNAL_XP per
    # (capped) reflection and the daily-quest bonus. The streak bonus is tracked
    # separately so coins (funded by *earned* XP) never drop when a streak lapses.
    practice_xp = _practice_xp(
        [(secs, type_ == "resonance_breathing") for secs, type_ in practice_rows]
    )
    earned_xp = (
        practice_xp
        + gratitude_xp_units * GRATITUDE_XP
        + journal_xp_units * JOURNAL_XP
        + quest_bonus_xp
    )
    return _XpBasis(
        earned_xp=earned_xp,
        streak_bonus_xp=streak_bonus_xp,
        current_streak=current_streak,
        longest_streak=longest_streak,
        rest_day_used=rest_day_used,
        cond_days=cond_days,
        session_days=session_days,
        gratitude_days=gratitude_days,
        journal_days=journal_days,
        gratitude_count=gratitude_count,
    )


class WalletBasis(NamedTuple):
    """The minimal earned-XP/level/streak the sanctuary wallet needs to mint coins, plus
    the within-level progress the spirit bond reads (xp_into_level / xp_for_next)."""

    earned_xp: int
    level: int
    current_streak: int
    xp_into_level: int
    xp_for_next: int


def get_wallet_basis(db: DBSession, user_id: uuid.UUID, *, today: date, tz: str) -> WalletBasis:
    """Earned XP, the level it implies, and the current streak — the only values the
    sanctuary wallet reads. Computed via the SAME `_xp_basis` core as `get_stats`, so the
    coins/level/streak are byte-identical to the dashboard, but WITHOUT the heatmap,
    this-week, today-count, or quest-list work that `get_stats` does and the wallet throws
    away. The level is computed on *earned* XP (total minus the streak bonus) so coins
    never drop when a streak lapses.
    """
    basis = _xp_basis(db, user_id, today=today, tz=tz)
    level, xp_into_level, xp_for_next = _level_progress(basis.earned_xp)
    return WalletBasis(
        earned_xp=basis.earned_xp,
        level=level,
        current_streak=basis.current_streak,
        xp_into_level=xp_into_level,
        xp_for_next=xp_for_next,
    )


# Per-local-day cap on the practice minutes that feed the Tending signal, so one marathon
# sitting (or a flood of sessions on a single day) can't inflate it — Tending should reward
# *showing up over time*, not a single grind. Genuine daily practice sits well under this; it
# only blunts farming. Mirrors the anti-spam stance of the gratitude/journal daily caps.
TENDING_DAILY_MINUTES_CAP = 60


class TendingSignals(NamedTuple):
    """The monotonic practice signals that fund the Sanctuary "Tending" score (see
    docs/design/sanctuary-upgrades-tended.md). Every field only ever grows or holds over the
    immutable activity log — distinct practice days, the *longest* (not current) streak, and
    lifetime per-minute-floored, daily-capped breathing/meditation minutes — so any score
    blended from them is monotonic and an item's Tended stage never regresses.

    `distinct_session_types` is a small variety signal (how many of SESSION_TYPES the user
    has ever practiced); it too only ever grows.
    """

    practice_days: int  # distinct local days meeting the MIN_PRACTICE_SECONDS practice floor
    longest_streak: int  # longest consecutive-day run ever (monotonic; current streak is not)
    breathing_minutes: int  # lifetime resonance-breathing minutes, per-day-capped
    meditation_minutes: int  # lifetime non-breathing minutes, per-day-capped
    distinct_session_types: int  # how many distinct SESSION_TYPES ever practiced (variety)


def get_tending_signals(
    db: DBSession, user_id: uuid.UUID, *, today: date, tz: str
) -> TendingSignals:
    """The monotonic practice signals behind the Sanctuary Tending score. All read-time,
    nothing stored (the same stance as XP/streaks). Practice-day counting reuses the
    MIN_PRACTICE_SECONDS floor; the minute totals are floored per whole minute and capped per
    local day (TENDING_DAILY_MINUTES_CAP) to resist farming, mirroring the existing anti-spam.
    """
    # Distinct practice days + the longest streak — the consistency core. A day counts only
    # once its total session time reaches MIN_PRACTICE_SECONDS (so a 1-second sit is ignored).
    session_local_day = _local_date(tz, Session.occurred_at)
    day_rows = db.execute(
        select(session_local_day)
        .where(Session.user_id == user_id)
        .group_by(session_local_day)
        .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
    ).all()
    session_days = {row[0] for row in day_rows}
    _current, longest_streak, _rest = compute_streaks(session_days, today)

    # Per-day, per-type capped minutes. Each (local day × is-breathing) bucket's whole minutes
    # are floored then clamped to TENDING_DAILY_MINUTES_CAP, so neither a marathon sit nor a
    # spam of sessions on one day inflates the total. Summed over all days → lifetime minutes.
    is_breathing = Session.type == "resonance_breathing"
    per_day = (
        select(
            is_breathing.label("breathing"),
            func.least(
                func.sum(Session.duration_seconds) / 60, TENDING_DAILY_MINUTES_CAP
            ).label("minutes"),
        )
        .where(Session.user_id == user_id)
        .group_by(session_local_day, is_breathing)
        .subquery()
    )
    breathing_minutes = int(
        db.execute(
            select(func.coalesce(func.sum(per_day.c.minutes), 0)).where(
                per_day.c.breathing.is_(True)
            )
        ).scalar_one()
    )
    meditation_minutes = int(
        db.execute(
            select(func.coalesce(func.sum(per_day.c.minutes), 0)).where(
                per_day.c.breathing.is_(False)
            )
        ).scalar_one()
    )

    # Variety: how many distinct session types the user has ever practiced (a small bonus for
    # a rounded practice). A type counts only once its sessions of that type total at least
    # MIN_PRACTICE_SECONDS, so a flurry of trivial 1-second sits across distinct types can't
    # shortcut growth (the same anti-spam floor the practice-day count uses above). Still
    # monotonic — cumulative per-type seconds never decrease, so a counted type stays counted.
    type_rows = db.execute(
        select(Session.type)
        .where(Session.user_id == user_id)
        .group_by(Session.type)
        .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
    ).all()
    distinct_types = len(type_rows)

    return TendingSignals(
        practice_days=len(session_days),
        longest_streak=longest_streak,
        breathing_minutes=breathing_minutes,
        meditation_minutes=meditation_minutes,
        distinct_session_types=distinct_types,
    )


def get_stats(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    today: date,
    tz: str = "UTC",
    quest_features: list[str] | None = None,
) -> DashboardStats:
    total_seconds, session_count = db.execute(
        select(
            func.coalesce(func.sum(Session.duration_seconds), 0),
            func.count(Session.id),
        ).where(Session.user_id == user_id)
    ).one()

    # The XP/streak core (also drives the sanctuary wallet — single source of truth).
    basis = _xp_basis(db, user_id, today=today, tz=tz)
    cond_days = basis.cond_days
    current_streak = basis.current_streak
    streak_bonus_xp = basis.streak_bonus_xp

    # Last 7 calendar days, zero-filled, oldest → today.
    week_start = today - timedelta(days=6)
    local_day = _local_date(tz, Session.occurred_at)
    rows = db.execute(
        select(
            local_day,
            func.coalesce(func.sum(Session.duration_seconds), 0),
        )
        .where(
            Session.user_id == user_id,
            local_day >= week_start,
            local_day <= today,
        )
        .group_by(local_day)
    ).all()
    by_date = {row[0]: int(row[1]) for row in rows}

    this_week = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        this_week.append(DailyTotal(date=day, seconds=by_date.get(day, 0)))

    # Total XP adds the streak bonus back; the displayed level rides full XP.
    xp = basis.xp
    level, xp_into_level, xp_for_next_level = _level_progress(xp)

    # Today's quest list is personalized: the user opts into a subset of
    # QUEST_FEATURES (≥3); NULL (not chosen yet) falls back to all four. Within each
    # chosen category, today's rotating variant is surfaced with its own label + XP.
    # For count-based variants ("meditate twice", "write three gratitudes"), how many of
    # the thing was done today — drives the X/Y counter the UI shows.
    today_count = {
        "double_sit": db.execute(
            select(func.count(Session.id)).where(
                Session.user_id == user_id,
                Session.type != "resonance_breathing",
                _local_date(tz, Session.occurred_at) == today,
            )
        ).scalar_one(),
        "gratitude_three": db.execute(
            select(func.count(GratitudeEntry.id)).where(
                GratitudeEntry.user_id == user_id,
                _local_date(tz, GratitudeEntry.created_at) == today,
            )
        ).scalar_one(),
    }

    selected = set(quest_features) if quest_features else set(QUEST_FEATURES)
    daily_quests = []
    for key in categories_for_day(selected, today):  # canonical order, capped + rotating
        quest = quest_for(key, today)
        done = today in cond_days[quest.cond]
        progress = (
            min(int(today_count.get(quest.variant, 0)), quest.target)
            if quest.target > 1
            else int(done)
        )
        daily_quests.append(
            QuestStatus(
                key=quest.key,
                variant=quest.variant,
                label=quest.label,
                xp=quest.xp,
                done=done,
                progress=progress,
                target=quest.target,
            )
        )

    return DashboardStats(
        total_seconds=int(total_seconds),
        session_count=int(session_count),
        current_streak_days=current_streak,
        longest_streak_days=basis.longest_streak,
        rest_day_used=basis.rest_day_used,
        xp=xp,
        level=level,
        xp_into_level=xp_into_level,
        xp_for_next_level=xp_for_next_level,
        this_week=this_week,
        gratitude_count=basis.gratitude_count,
        streak_bonus_xp=streak_bonus_xp,
        daily_quests=daily_quests,
    )


def get_activity(
    db: DBSession, user_id: uuid.UUID, *, today: date, days: int = 365, tz: str = "UTC"
) -> ActivityCalendar:
    """Daily practice totals over the last `days`, sparse (active days only).

    Each active day also carries `all_quests` — whether all three daily quests
    (gratitude, ≥60s breathing, a session) were completed that local day — so the
    heatmap can colour days as inactive / active / all-quests-complete.
    """
    start = today - timedelta(days=days - 1)
    local_day = _local_date(tz, Session.occurred_at)
    rows = db.execute(
        select(
            local_day,
            func.coalesce(func.sum(Session.duration_seconds), 0),
        )
        .where(
            Session.user_id == user_id,
            local_day >= start,
            local_day <= today,
        )
        .group_by(local_day)
        .having(func.sum(Session.duration_seconds) >= MIN_PRACTICE_SECONDS)
        .order_by(local_day)
    ).all()

    # Days (in-window) with a gratitude entry, and with ≥60s of resonance breathing.
    # A session is implied for every active day, so all_quests = gratitude ∧ breathing.
    grat_day = _local_date(tz, GratitudeEntry.created_at)
    gratitude_days = {
        r[0]
        for r in db.execute(
            select(grat_day)
            .where(GratitudeEntry.user_id == user_id, grat_day >= start, grat_day <= today)
            .distinct()
        ).all()
    }
    breathing_days = {
        r[0]
        for r in db.execute(
            select(local_day)
            .where(
                Session.user_id == user_id,
                Session.type == "resonance_breathing",
                local_day >= start,
                local_day <= today,
            )
            .group_by(local_day)
            .having(func.sum(Session.duration_seconds) >= BREATHE_QUEST_SECONDS)
        ).all()
    }

    active_days = [
        ActivityDay(
            date=row[0],
            seconds=int(row[1]),
            all_quests=row[0] in gratitude_days and row[0] in breathing_days,
        )
        for row in rows
    ]
    return ActivityCalendar(start=start, end=today, days=active_days)

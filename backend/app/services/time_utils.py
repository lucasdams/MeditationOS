"""Shared timezone / local-day helpers used across services.

Day-bucketing for streaks, quests, the heatmap, goals, insights, analytics and
reminders all roll over at the *user's* local midnight. The canonical building
blocks live here so the exact SQL and streak semantics are defined once.
"""

from datetime import date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func

# Streak insurance ("rest day"): the current streak tolerates ONE skipped day — a
# single-day gap is bridged so a missed day doesn't reset progress (wellness: a nudge,
# not shame). Two missed days in a row still ends it. Computed, nothing stored.
REST_DAYS_PER_STREAK = 1

# A day only counts as practice (for streaks + the activity heatmap) once its total
# session time reaches this, so daily 1-second sits can't prop up a streak or light the
# calendar. Short sessions still save and show their real time in the weekly view. Lives
# here (next to the streak/local-day primitives) so both dashboard_service and
# reminder_service can import it at module level without a circular dependency.
MIN_PRACTICE_SECONDS = 60


def local_date(tz: str, column):
    """The calendar date of a timestamptz column in the given IANA timezone."""
    return func.date(func.timezone(tz, column))


def zone(tz: str | None) -> ZoneInfo:
    """Resolve an IANA timezone string to a ZoneInfo, falling back to UTC."""
    try:
        return ZoneInfo(tz or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def compute_streaks(dates: set[date], today: date) -> tuple[int, int, bool]:
    """Return (current_streak_days, longest_streak_days, rest_day_used).

    - longest: the longest run of strictly consecutive practice days ever. Rest-day
      bridges are NEVER folded into `longest` (the rule is applied consistently to every
      run, not just the current one) — they only ever extend the *current* streak. The
      one exception is purely an invariant guard: if the insured current streak happens to
      exceed the longest consecutive run, `longest` is raised to it so `current ≤ longest`
      always holds.
    - current: the run ending today OR yesterday, allowing up to REST_DAYS_PER_STREAK
      single-day gaps to be bridged; 0 if it has lapsed. Missing *only* today (practiced
      yesterday) keeps the streak, but that today-grace and the rest-day bridge do NOT stack:
      an absent today consumes the rest-day allowance, so a *second* consecutive missed day
      (today AND yesterday both absent) ends the streak — matching "two missed days in a row
      still ends it".
    - rest_day_used: whether the current streak is currently leaning on a rest day.
    """
    if not dates:
        return 0, 0, False

    ordered = sorted(dates)
    longest = run = 1
    for prev, cur in zip(ordered, ordered[1:], strict=False):
        run = run + 1 if (cur - prev).days == 1 else 1
        longest = max(longest, run)

    # Walk back from today, bridging a single skipped day with the rest-day allowance (the bridged
    # day isn't counted toward the length). A missing today is graced, but that grace SPENDS the
    # rest-day budget — so the today-grace and an interior rest-day bridge can't BOTH apply to the
    # leading gap. That keeps the two allowances from stacking into two consecutive free days
    # (which would let a streak survive two missed days in a row, contradicting the module rule).
    current = 0
    rest_budget = REST_DAYS_PER_STREAK
    rest_used = False
    if today in dates:
        day = today
    else:
        # Grace the absent today by starting the walk at yesterday — but consume the rest-day
        # budget for it, so a further gap (yesterday also missing) can't be bridged again. This
        # does NOT flip `rest_used`: that flag means "an interior day is bridged" and drives the
        # reminder logic (a streak leaning on a rest day is safe today, so it isn't nudged). A
        # streak that has merely missed today but practiced yesterday IS still at risk of breaking
        # at midnight and must stay nudge-eligible, so the today-grace must not set the flag.
        day = today - timedelta(days=1)
        rest_budget -= 1
    while True:
        if day in dates:
            current += 1
            day -= timedelta(days=1)
        elif rest_budget > 0 and (day - timedelta(days=1)) in dates:
            rest_budget -= 1
            rest_used = True
            day -= timedelta(days=1)
        else:
            break

    # `longest` is the longest strictly-consecutive run (rest bridges excluded). The
    # max() only enforces the invariant that the current streak can't exceed it.
    return current, max(longest, current), rest_used

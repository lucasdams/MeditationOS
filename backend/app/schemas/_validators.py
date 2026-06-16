"""Reusable Pydantic validators shared across request schemas."""

from datetime import UTC, datetime, timedelta

# How far a user-set timestamp may sit ahead of UTC "now" before we reject it. A day
# of slack absorbs clock skew AND legitimate same-local-day logging from users far
# ahead of UTC (the client sends a tz-aware local time; up to ~UTC+14 it can read as
# future against UTC). It still blocks the real exploit — dating an entry days or weeks
# ahead to farm streaks / inflate total minutes → XP → coins or skew the trend window.
_FUTURE_SLACK = timedelta(days=1)
# The oldest a user-set timestamp may be. Generous enough for legitimate back-dating
# while rejecting clearly bogus far-past values that would distort the analytics window.
_PAST_FLOOR = timedelta(days=365 * 5)


def _capped_blank_to_none(max_length: int):
    """A BeforeValidator that trims whitespace, maps empty/whitespace-only → None, and
    rejects over-length input as a 422.

    Doing the cap here (rather than via Field(max_length=...)) lets the field stay
    `str | None`: the constraint applies only when a real string is present, so an explicit
    `null` (used to clear the value) passes straight through instead of tripping a length
    validator that can't handle None.
    """

    def _validate(value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                return None
            if len(trimmed) > max_length:
                raise ValueError(f"must be at most {max_length} characters")
            return trimmed
        return value

    return _validate


def trimmed_nonblank(max_length: int):
    """A BeforeValidator for a REQUIRED text field: trims whitespace and rejects an
    empty/whitespace-only result as a 422 (so `"   \\n "` can't light a quest or earn XP).

    Unlike `_capped_blank_to_none` this never coerces to None — the field stays a
    non-nullable `str`. Over-length input (after trimming) is rejected too, replacing a
    plain `Field(max_length=...)` so the stored value and the cap both apply to the
    trimmed text.
    """

    def _validate(value: object) -> object:
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                raise ValueError("must not be blank")
            if len(trimmed) > max_length:
                raise ValueError(f"must be at most {max_length} characters")
            return trimmed
        return value

    return _validate


def reject_implausible_timestamp(value: object) -> object:
    """An AfterValidator for a user-set `datetime`: reject values too far in the FUTURE
    (clock-skew slack aside) or implausibly far in the PAST as a 422.

    An unbounded timestamp would let a future- or far-past-dated entry inflate total
    minutes → XP → coins or skew the analytics window. Naive datetimes are treated as
    UTC for the comparison. `None` (an absent optional value) passes through.
    """

    if not isinstance(value, datetime):
        return value
    now = datetime.now(UTC)
    moment = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if moment > now + _FUTURE_SLACK:
        raise ValueError("must not be in the future")
    if moment < now - _PAST_FLOOR:
        raise ValueError("is too far in the past")
    return value

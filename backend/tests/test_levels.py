"""XP / level curve (dashboard_service._level_progress) and the front-loaded practice
curve (_practice_xp / _effective_minutes)."""

from datetime import date

import pytest

from app.services.dashboard_service import (
    BREATHING_XP_MULTIPLIER,
    MEDITATION_XP_PER_MIN,
    _level_progress,
    _practice_xp,
)
from app.services.quest_pool import quest_for


def test_zero_xp_is_level_one():
    assert _level_progress(0) == (1, 0, 20)


def test_level_boundaries():
    assert _level_progress(19) == (1, 19, 20)  # just shy of level 2
    assert _level_progress(20) == (2, 0, 40)  # reaches level 2
    assert _level_progress(60) == (3, 0, 60)  # reaches level 3


def test_mid_level_progress():
    # cumulative for L3 = 60, L4 = 120 → 100 XP is level 3, 40 into it
    assert _level_progress(100) == (3, 40, 60)


def test_levels_are_monotonic():
    last = 0
    for xp in range(0, 1000, 7):
        level = _level_progress(xp)[0]
        assert level >= last
        last = level


# --- Front-loaded practice-XP curve --------------------------------------------------


def _med(minutes):
    return _practice_xp([(minutes * 60, False)])


def _breath(minutes):
    return _practice_xp([(minutes * 60, True)])


def test_sub_minute_session_earns_zero():
    assert _practice_xp([(59, False)]) == 0
    assert _practice_xp([(59, True)]) == 0
    assert _practice_xp([(0, False)]) == 0


def test_worked_example_values():
    # The reviewable curve from the docstring (meditation @2/eff-min).
    assert _med(10) == 20
    assert _med(30) == 50
    assert _med(60) == 70
    assert _med(120) == 100
    # Breathing is the same effective minutes paid at BREATHING_XP_MULTIPLIER×.
    assert _breath(10) == 30
    assert _breath(60) == 105
    assert _breath(120) == 150


def test_breathing_beats_meditation_for_equal_minutes():
    for minutes in (5, 10, 30, 60, 120):
        assert _breath(minutes) > _med(minutes)
    # Both share the same effective-minutes curve; breathing is just paid at the higher
    # per-effective-minute rate, so its XP is that ratio of meditation's.
    assert _breath(10) * MEDITATION_XP_PER_MIN == _med(10) * BREATHING_XP_MULTIPLIER
    assert MEDITATION_XP_PER_MIN == 2 and BREATHING_XP_MULTIPLIER == 3


def test_curve_is_front_loaded_within_a_session():
    # Doubling one session's length gives strictly LESS than double its XP.
    assert _med(120) < 2 * _med(60)
    assert _breath(120) < 2 * _breath(60)
    # Marginal XP per minute strictly decreases: the XP gained going 60→120 is less than
    # the XP gained going 0→60.
    assert (_med(120) - _med(60)) < (_med(60) - _med(0))


def test_splitting_beats_one_giant_session():
    # Two sessions of half the length (summing to the same minutes) earn strictly more
    # than one giant session — because the giant session pushes minutes into the reduced
    # tiers while each shorter sit stays nearer full rate.
    one_giant = _practice_xp([(120 * 60, False)])
    split = _practice_xp([(60 * 60, False), (60 * 60, False)])
    assert split > one_giant
    # Same for breathing.
    assert _practice_xp([(60 * 60, True), (60 * 60, True)]) > _practice_xp([(120 * 60, True)])


@pytest.mark.parametrize(
    ("minutes", "expected_med", "expected_breath"),
    [
        # Just past tier 1 (20 min). eff = 20.5 → med 20.5*2 = 41.0; breath 20.5*3 = 61.5
        # which int()-truncates to 61 (NOT 62) — guards an off-by-one rounding-up bug.
        (21, 41, 61),
        # Just past tier 2 (40 min). eff = 30.25 → med 60.5 → int 60 (the .5 is dropped,
        # NOT rounded to 61); breath 90.75 → int 90.
        (41, 60, 90),
        # Deep in tier 3 (60+ min). eff = 35.25 → med 70.5 → 70; breath 105.75 → 105.
        (61, 70, 105),
    ],
)
def test_practice_xp_rounding_at_tier_boundaries(minutes, expected_med, expected_breath):
    # int() truncates toward zero, so fractional effective-minutes at a tier edge must
    # floor — never round up. A single +1 here would slip past every other XP test.
    assert _med(minutes) == expected_med
    assert _breath(minutes) == expected_breath


def test_practice_xp_is_monotonic_non_decreasing():
    last = 0
    for minutes in range(0, 300):
        xp = _med(minutes)
        assert xp >= last
        last = xp


def test_stats_endpoint_reports_xp_and_level(client):
    creds = {"email": "xp@example.com", "password": "correct horse"}
    client.post("/api/v1/auth/register", json=creds)
    client.post("/api/v1/auth/login", json=creds)
    # 60 minutes of meditation in a single session. Under the front-loaded curve a 60-min
    # sit is worth 35 effective minutes → 70 practice XP (not the old linear 120), because
    # the back half of a long sit pays less per minute.
    client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 3600,
            "occurred_at": "2026-01-01T08:00:00",
        },
    )
    body = client.get("/api/v1/dashboard/stats").json()
    # 70 practice + that day's meditate quest (a single 60-min session completes every
    # variant except "meditate twice") + 0 streak (the session is back in January). The
    # level is derived from the exact XP rather than hardcoded, since the quest XP varies
    # by the date's rotation.
    quest = quest_for("meditate", date(2026, 1, 1))
    quest_xp = 0 if quest.variant == "double_sit" else quest.xp
    expected_xp = 70 + quest_xp
    assert body["xp"] == expected_xp
    expected_level, _, expected_next = _level_progress(expected_xp)
    assert body["level"] == expected_level
    assert body["xp_for_next_level"] == expected_next

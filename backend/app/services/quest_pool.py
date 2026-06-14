"""The daily-quest pool: per-category quest variants that rotate by the date.

Each user receives quests for the activity categories they opted into
(`quest_features` on the user — meditate / breathe / gratitude / journal). Within a
category the *specific* quest shown rotates by the calendar date, so the same category
offers, e.g., "Meditate today" one day and "Sit 10+ minutes" the next. Quests carry
**varied XP by effort** — the harder a challenge, the more it pays.

Everything here is a pure function of the category and the date — nothing is stored —
so it composes with the computed-from-activity model (see
docs/decisions/0009-gamification-computed-from-activity.md). `dashboard_service`
owns the matching per-day "was it done?" conditions (keyed by `Quest.cond`).
"""

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Quest:
    key: str  # the activity category — drives the frontend icon/link/colour
    variant: str  # stable id of this specific quest within the category
    label: str  # user-facing text
    xp: int  # reward, varied by effort
    cond: str  # which per-day condition decides "done" (see dashboard_service.cond_days)


# Ordered variants per category. The day's ordinal indexes into each list, so the
# surfaced quest rotates day to day. Order is the rotation order — keep the base
# (easiest) variant first so a brand-new day still has a gentle option somewhere.
QUEST_POOL: dict[str, list[Quest]] = {
    "meditate": [
        Quest("meditate", "meditate", "Meditate today", 15, "meditate"),
        Quest("meditate", "long_sit", "Sit for 10+ minutes in one session", 30, "long_sit"),
        Quest("meditate", "double_sit", "Meditate twice today", 25, "double_sit"),
    ],
    "breathe": [
        Quest("breathe", "breathe", "Breathe for a minute", 20, "breathe"),
        Quest("breathe", "deep_breathe", "Breathe for 5+ minutes", 30, "deep_breathe"),
        Quest("breathe", "slow_breathe", "Breathe slow — 5 bpm or under", 35, "slow_breathe"),
    ],
    "gratitude": [
        Quest("gratitude", "gratitude", "Write a gratitude", 10, "gratitude"),
        Quest("gratitude", "gratitude_three", "Write three gratitudes", 25, "gratitude_three"),
    ],
    "journal": [
        Quest("journal", "journal", "Write a journal entry", 20, "journal"),
        Quest("journal", "mood_journal", "Journal with a mood", 25, "mood_journal"),
    ],
}

# Stagger each category's rotation so they don't all advance in lockstep — keeps the
# day's full quest set feeling varied rather than "everything got harder at once".
_OFFSET = {"meditate": 0, "breathe": 1, "gratitude": 2, "journal": 3}


def quest_for(category: str, day: date) -> Quest:
    """The quest surfaced for `category` on `day` — deterministic, rotates daily."""
    pool = QUEST_POOL[category]
    return pool[(day.toordinal() + _OFFSET[category]) % len(pool)]

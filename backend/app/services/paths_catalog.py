"""The Paths catalog — static guided courses, defined in code like the breathing presets.

A **Path** is a short multi-day beginner course: an ordered list of days, each prescribing
ONE practice plus on-screen guidance (no recorded audio). Nothing here is stored per user —
the catalog is a pure constant. A day's *completion* is never written down; it is DERIVED
from the user's real logged activity (see `path_service.py` and
docs/decisions/0009-gamification-computed-from-activity.md). This module only describes the
content; it knows nothing about a user or their sessions.

`PATHS` is keyed by path id (the stable url-safe slug). Order within `days` is the order the
user walks them; `index` is 1-based and used by the API + frontend.
"""

from dataclasses import dataclass

# The practices a path day can prescribe. `breathe` matches a resonance/energizing breathing
# session; `meditate` a non-breathing meditation session; `gratitude` a logged gratitude entry
# (its `min_minutes` is ignored — a gratitude is a single moment, not a timed sit).
PathPractice = str  # one of: "breathe" | "meditate" | "gratitude"


@dataclass(frozen=True)
class PathDay:
    """One day of a path: a single practice + the bar a logged session must clear + the cue."""

    index: int  # 1-based position in the path
    title: str  # short heading, e.g. "Day 3 · Settle the shoulders"
    practice: PathPractice  # "breathe" | "meditate" | "gratitude"
    min_minutes: int  # the minimum logged duration (minutes) that completes this day; 0 = any
    cue: str  # the on-screen guidance line(s)


@dataclass(frozen=True)
class Path:
    """A short guided course — static content, like a breathing preset."""

    id: str  # stable url-safe slug, e.g. "first-7-days"
    title: str
    blurb: str
    days: tuple[PathDay, ...]

    @property
    def total_days(self) -> int:
        return len(self.days)


# Ordered list of every shipped path. Derived completion has landed (path_service.py computes a
# day's completion from real logged activity), so the catalog now carries a small curated set:
# two beginner on-ramps plus a focus week and an evening wind-down week. Keep entries short,
# calm, and prescribing ONE practice a day — a sequence, not a content library.
PATHS: tuple[Path, ...] = (
    Path(
        id="first-7-days",
        title="Your First 7 Days",
        blurb="One small sit a day for a week.",
        days=(
            PathDay(
                index=1,
                title="Day 1 · Just one minute",
                practice="breathe",
                min_minutes=1,
                cue="Just follow the orb. One slow minute.",
            ),
            PathDay(
                index=2,
                title="Day 2 · A touch longer",
                practice="breathe",
                min_minutes=2,
                cue="Same as yesterday, a touch longer.",
            ),
            PathDay(
                index=3,
                title="Day 3 · Settle the shoulders",
                practice="breathe",
                min_minutes=3,
                cue="Notice your shoulders drop on the out-breath.",
            ),
            PathDay(
                index=4,
                title="Day 4 · Eyes closed",
                practice="meditate",
                min_minutes=3,
                cue="Eyes closed. Rest attention on the breath; wander, return.",
            ),
            PathDay(
                index=5,
                title="Day 5 · Lengthen the exhale",
                practice="breathe",
                min_minutes=5,
                cue="Longer exhale than inhale — let it lengthen.",
            ),
            PathDay(
                index=6,
                title="Day 6 · One small thing",
                practice="gratitude",
                min_minutes=0,
                cue="One small thing you're grateful for.",
            ),
            PathDay(
                index=7,
                title="Day 7 · Your way now",
                practice="meditate",
                min_minutes=5,
                cue="Your way now. You've built a week.",
            ),
        ),
    ),
    Path(
        id="three-calm-breaths",
        title="Three Calming Breaths",
        blurb="Three short days to find your calm on the out-breath.",
        days=(
            PathDay(
                index=1,
                title="Day 1 · A single calm minute",
                practice="breathe",
                min_minutes=1,
                cue="Sit and follow the orb. Let the first out-breath soften you.",
            ),
            PathDay(
                index=2,
                title="Day 2 · Sink a little deeper",
                practice="breathe",
                min_minutes=2,
                cue="Two minutes today. Let each exhale carry the tension out.",
            ),
            PathDay(
                index=3,
                title="Day 3 · Steady and slow",
                practice="breathe",
                min_minutes=3,
                cue="Three slow minutes. Notice how much calmer the breath has become.",
            ),
        ),
    ),
    Path(
        id="focus-foundations",
        title="Focus Foundations",
        blurb="A week of short sits to steady a busy mind.",
        days=(
            PathDay(
                index=1,
                title="Day 1 · Count the breath",
                practice="meditate",
                min_minutes=3,
                cue="Count each out-breath, one to ten. Lose count? Begin again at one.",
            ),
            PathDay(
                index=2,
                title="Day 2 · The wander and the return",
                practice="meditate",
                min_minutes=3,
                cue="Notice the moment the mind wanders. That noticing is the win — return gently.",
            ),
            PathDay(
                index=3,
                title="Day 3 · One anchor",
                practice="meditate",
                min_minutes=4,
                cue="Pick one spot — nostrils or belly — and rest your attention there.",
            ),
            PathDay(
                index=4,
                title="Day 4 · A slow reset",
                practice="breathe",
                min_minutes=3,
                cue="Slow breathing steadies the mind. Follow the orb and let it set your pace.",
            ),
            PathDay(
                index=5,
                title="Day 5 · Name what pulls",
                practice="meditate",
                min_minutes=5,
                cue="When something pulls you away, softly name it — thinking, hearing — and return.",
            ),
            PathDay(
                index=6,
                title="Day 6 · A little longer",
                practice="meditate",
                min_minutes=5,
                cue="Same sit as yesterday, held a little longer. Let it be ordinary.",
            ),
            PathDay(
                index=7,
                title="Day 7 · Steady, your way",
                practice="meditate",
                min_minutes=6,
                cue="Choose your anchor and sit. A week of returns has built real steadiness.",
            ),
        ),
    ),
    Path(
        id="wind-down-week",
        title="Wind-Down Week",
        blurb="Seven evenings to soften the end of the day.",
        days=(
            PathDay(
                index=1,
                title="Day 1 · Arrive home",
                practice="breathe",
                min_minutes=2,
                cue="Two slow minutes. Let the day's pace drain out on each exhale.",
            ),
            PathDay(
                index=2,
                title="Day 2 · Put the day down",
                practice="meditate",
                min_minutes=3,
                cue="Sit and let the day's replay soften. Nothing to fix tonight.",
            ),
            PathDay(
                index=3,
                title="Day 3 · Longer exhale",
                practice="breathe",
                min_minutes=3,
                cue="Let the exhale lengthen — the body reads it as safety.",
            ),
            PathDay(
                index=4,
                title="Day 4 · One good thing",
                practice="gratitude",
                min_minutes=0,
                cue="Name one good thing from today, however small.",
            ),
            PathDay(
                index=5,
                title="Day 5 · Heavy limbs",
                practice="meditate",
                min_minutes=5,
                cue="Let your limbs grow heavy where you sit. Rest attention low in the body.",
            ),
            PathDay(
                index=6,
                title="Day 6 · Slow to slower",
                practice="breathe",
                min_minutes=5,
                cue="Five unhurried minutes. Let the pace settle to slower than feels usual.",
            ),
            PathDay(
                index=7,
                title="Day 7 · A kind close",
                practice="meditate",
                min_minutes=5,
                cue="Close the week kindly: a quiet sit, then straight toward rest.",
            ),
        ),
    ),
)

_PATHS_BY_ID: dict[str, Path] = {p.id: p for p in PATHS}


def get_path(path_id: str) -> Path | None:
    """The path with this id, or None if unknown."""
    return _PATHS_BY_ID.get(path_id)


def all_paths() -> tuple[Path, ...]:
    """Every shipped path, in catalog (display) order."""
    return PATHS

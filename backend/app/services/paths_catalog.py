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


# Ordered list of every shipped path. Keep this small — ship 1–2 short paths first and expand
# only once completion lands (see docs/beginner-first-revision.md §8).
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
)

_PATHS_BY_ID: dict[str, Path] = {p.id: p for p in PATHS}


def get_path(path_id: str) -> Path | None:
    """The path with this id, or None if unknown."""
    return _PATHS_BY_ID.get(path_id)


def all_paths() -> tuple[Path, ...]:
    """Every shipped path, in catalog (display) order."""
    return PATHS

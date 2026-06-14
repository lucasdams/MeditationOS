"""The program catalog — curated, multi-day practice *plans* (a sequence of prescribed
practices, not an audio library; the app stays data-first). Kept in code, like the
sanctuary catalog: it's static curated content, so there's no catalog table to seed.
Per-user enrollment/progress is the only stored part (see program_service.py)."""

from dataclasses import dataclass

# The activities a program day can prescribe — the same vocabulary as quests/goals.
ACTIVITIES = ("meditate", "breathe", "gratitude", "journal")


@dataclass(frozen=True)
class ProgramDay:
    title: str
    activity: str  # one of ACTIVITIES — lets the UI deep-link to the right page
    detail: str


@dataclass(frozen=True)
class Program:
    key: str
    title: str
    description: str
    category: str  # calm | focus | habit
    days: list[ProgramDay]


def _gen(activity: str, title: str, detail: str) -> ProgramDay:
    return ProgramDay(title=title, activity=activity, detail=detail)


# A pattern used to generate the longer plans without hand-writing every day.
_HABIT_CYCLE = [
    ("meditate", "Sit", "A short mindfulness sit — just follow the breath."),
    ("breathe", "Breathe", "A few minutes of slow resonance breathing."),
    ("gratitude", "Gratitude", "Note one thing you're grateful for."),
    ("journal", "Reflect", "A line or two on how the practice felt."),
]


def _habit_days(n: int) -> list[ProgramDay]:
    days = []
    for i in range(n):
        activity, title, detail = _HABIT_CYCLE[i % len(_HABIT_CYCLE)]
        days.append(_gen(activity, f"Day {i + 1} · {title}", detail))
    return days


PROGRAMS: dict[str, Program] = {
    "calm7": Program(
        key="calm7",
        title="7 Days to Calm",
        description=(
            "A gentle first week — short breathing, mindfulness, and gratitude to "
            "settle the nervous system."
        ),
        category="calm",
        days=[
            _gen("breathe", "Day 1 · Arrive",
                 "5 minutes of slow breathing — longer exhale than inhale."),
            _gen("meditate", "Day 2 · Notice",
                 "A 5-minute mindfulness sit. Just watch the breath."),
            _gen("gratitude", "Day 3 · Appreciate",
                 "Write down three small things that went right today."),
            _gen("breathe", "Day 4 · Deepen",
                 "8 minutes of resonance breathing. Let the exhale lengthen."),
            _gen("meditate", "Day 5 · Body",
                 "A short body scan — soften where you're holding tension."),
            _gen("journal", "Day 6 · Reflect",
                 "How has your body felt across the week? A few lines."),
            _gen("meditate", "Day 7 · Rest",
                 "A calm 10-minute sit. Notice what's shifted since Day 1."),
        ],
    ),
    "focus10": Program(
        key="focus10",
        title="Focus Foundations",
        description=(
            "Ten days building steady attention — progressively longer mindfulness "
            "sits with reflection."
        ),
        category="focus",
        days=[
            _gen("meditate", "Day 1 · Anchor",
                 "A 5-minute sit. Pick one anchor (breath) and return."),
            _gen("meditate", "Day 2 · Count",
                 "Count breaths 1–10, then restart when you drift."),
            _gen("breathe", "Day 3 · Steady",
                 "Coherence breathing (5 in, 5 out) for 5 minutes."),
            _gen("meditate", "Day 4 · Longer",
                 "Stretch to a 10-minute sit. Notice the urge to stop."),
            _gen("journal", "Day 5 · Check in",
                 "When did your attention wander most? Write it down."),
            _gen("meditate", "Day 6 · Labels",
                 "Note 'thinking' softly each time you drift, then return."),
            _gen("meditate", "Day 7 · Open",
                 "10 minutes of open awareness — let sounds come and go."),
            _gen("breathe", "Day 8 · Reset",
                 "Box breathing (4·4·4·4) for 5 minutes to sharpen focus."),
            _gen("meditate", "Day 9 · Sustain",
                 "A 15-minute sit. Stay with the anchor as long as you can."),
            _gen("journal", "Day 10 · Review",
                 "What's easier now than on Day 1? Capture it."),
        ],
    ),
    "habit21": Program(
        key="habit21",
        title="21-Day Habit Builder",
        description=(
            "Three weeks of small daily practice to make showing up automatic — one "
            "short thing a day."
        ),
        category="habit",
        days=_habit_days(21),
    ),
}


def list_programs() -> list[Program]:
    return list(PROGRAMS.values())


def get_program(key: str) -> Program | None:
    return PROGRAMS.get(key)

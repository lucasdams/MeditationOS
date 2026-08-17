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
                cue="Longer exhale than inhale. Let it lengthen.",
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
                cue="Notice the moment the mind wanders. That noticing is the win. Return gently.",
            ),
            PathDay(
                index=3,
                title="Day 3 · One anchor",
                practice="meditate",
                min_minutes=4,
                cue="Pick one spot (nostrils or belly) and rest your attention there.",
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
                cue=(
                    "When something pulls you away, softly name it ("
                    "thinking, hearing) and return."
                ),
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
                cue="Let the exhale lengthen. The body reads it as safety.",
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


# ── Japanese localization ───────────────────────────────────────────────────────
# Translations keyed by the English text (title / blurb / day title / cue) — the catalog above
# stays the source of truth (ids, practices, weights). `localized_path(path, locale)` returns a
# copy with the display strings translated; anything without a translation falls back to English.
_JA: dict[str, str] = {
    # Path titles + blurbs
    "Your First 7 Days": "はじめの7日間",
    "One small sit a day for a week.": "一週間、一日ひとつのちいさな瞑想。",
    "Three Calming Breaths": "3つの落ち着く呼吸",
    "Three short days to find your calm on the out-breath.":
        "3日間、吐く息とともに落ち着きを見つける。",
    "Focus Foundations": "集中の土台",
    "A week of short sits to steady a busy mind.": "忙しい心を落ち着ける、一週間の短い瞑想。",
    "Wind-Down Week": "眠りへの一週間",
    "Seven evenings to soften the end of the day.": "一日の終わりをやわらげる、7つの夜。",
    # first-7-days
    "Day 1 · Just one minute": "1日目 · まずは一分",
    "Just follow the orb. One slow minute.": "オーブに合わせるだけ。ゆっくり一分。",
    "Day 2 · A touch longer": "2日目 · 少しだけ長く",
    "Same as yesterday, a touch longer.": "昨日と同じ、少しだけ長く。",
    "Day 3 · Settle the shoulders": "3日目 · 肩をゆるめる",
    "Notice your shoulders drop on the out-breath.": "吐く息で肩が下がるのに気づいて。",
    "Day 4 · Eyes closed": "4日目 · 目を閉じて",
    "Eyes closed. Rest attention on the breath; wander, return.":
        "目を閉じて。息に注意を置き、さまよったら戻る。",
    "Day 5 · Lengthen the exhale": "5日目 · 吐く息を長く",
    "Longer exhale than inhale. Let it lengthen.": "吸う息より、吐く息を長く。のびのびと。",
    "Day 6 · One small thing": "6日目 · ちいさなひとつ",
    "One small thing you're grateful for.": "感謝できる、ちいさなひとつを。",
    "Day 7 · Your way now": "7日目 · これからは自分流に",
    "Your way now. You've built a week.": "これからは自分流に。一週間を積み上げました。",
    # three-calm-breaths
    "Day 1 · A single calm minute": "1日目 · 落ち着いた一分",
    "Sit and follow the orb. Let the first out-breath soften you.":
        "座ってオーブに合わせて。最初の吐く息でやわらいで。",
    "Day 2 · Sink a little deeper": "2日目 · もう少し深く",
    "Two minutes today. Let each exhale carry the tension out.":
        "今日は二分。吐く息ごとに、こわばりを外へ。",
    "Day 3 · Steady and slow": "3日目 · ゆっくり、安定して",
    "Three slow minutes. Notice how much calmer the breath has become.":
        "ゆっくり三分。呼吸がどれだけ落ち着いたかに気づいて。",
    # focus-foundations
    "Day 1 · Count the breath": "1日目 · 呼吸を数える",
    "Count each out-breath, one to ten. Lose count? Begin again at one.":
        "吐く息を一から十まで数える。わからなくなったら、また一から。",
    "Day 2 · The wander and the return": "2日目 · さまよいと、戻り",
    "Notice the moment the mind wanders. That noticing is the win. Return gently.":
        "心がさまよう瞬間に気づく。その気づきが勝ち。そっと戻る。",
    "Day 3 · One anchor": "3日目 · ひとつの拠りどころ",
    "Pick one spot (nostrils or belly) and rest your attention there.":
        "一か所(鼻先かお腹)を選び、そこに注意を置く。",
    "Day 4 · A slow reset": "4日目 · ゆっくり整える",
    "Slow breathing steadies the mind. Follow the orb and let it set your pace.":
        "ゆっくりの呼吸は心を整える。オーブに合わせ、ペースを任せて。",
    "Day 5 · Name what pulls": "5日目 · 気をそらすものに名前を",
    "When something pulls you away, softly name it (thinking, hearing) and return.":
        "何かに気をそらされたら、そっと名前をつけて(考えている、聞いている)、戻る。",
    "Day 6 · A little longer": "6日目 · 少し長く",
    "Same sit as yesterday, held a little longer. Let it be ordinary.":
        "昨日と同じ瞑想を、少し長く。ふつうのこととして。",
    "Day 7 · Steady, your way": "7日目 · 自分流に、安定して",
    "Choose your anchor and sit. A week of returns has built real steadiness.":
        "拠りどころを選んで座る。戻りを重ねた一週間が、確かな安定を育てました。",
    # wind-down-week
    "Day 1 · Arrive home": "1日目 · 帰ってくる",
    "Two slow minutes. Let the day's pace drain out on each exhale.":
        "ゆっくり二分。吐く息ごとに、一日の慌ただしさを流して。",
    "Day 2 · Put the day down": "2日目 · 一日を置く",
    "Sit and let the day's replay soften. Nothing to fix tonight.":
        "座って、一日の再生をやわらげる。今夜、直すことはない。",
    "Day 3 · Longer exhale": "3日目 · 吐く息を長く",
    "Let the exhale lengthen. The body reads it as safety.":
        "吐く息を長く。からだはそれを安心と受けとる。",
    "Day 4 · One good thing": "4日目 · ひとつの良かったこと",
    "Name one good thing from today, however small.":
        "今日の良かったことをひとつ、どんなに小さくても。",
    "Day 5 · Heavy limbs": "5日目 · 手足を重く",
    "Let your limbs grow heavy where you sit. Rest attention low in the body.":
        "座ったまま手足を重く。注意をからだの下のほうに置いて。",
    "Day 6 · Slow to slower": "6日目 · ゆっくり、もっとゆっくり",
    "Five unhurried minutes. Let the pace settle to slower than feels usual.":
        "急がず五分。いつもより遅いくらいに、ペースを落として。",
    "Day 7 · A kind close": "7日目 · やさしく締めくくる",
    "Close the week kindly: a quiet sit, then straight toward rest.":
        "一週間をやさしく締めくくる:静かな瞑想、そのまま休みへ。",
}


def _t(text: str, locale: str) -> str:
    return _JA.get(text, text) if locale == "ja" else text


def localized_path(path: Path, locale: str = "en") -> Path:
    """A copy of `path` with its display strings (title, blurb, day titles + cues) translated to
    `locale` where a translation exists. Practices, weights, indices, and ids are untouched."""
    if locale == "en":
        return path
    return Path(
        id=path.id,
        title=_t(path.title, locale),
        blurb=_t(path.blurb, locale),
        days=tuple(
            PathDay(
                index=d.index,
                title=_t(d.title, locale),
                practice=d.practice,
                min_minutes=d.min_minutes,
                cue=_t(d.cue, locale),
            )
            for d in path.days
        ),
    )

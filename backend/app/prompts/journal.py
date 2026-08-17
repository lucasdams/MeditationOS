"""Versioned journaling-prompt pools.

The frontend already ships a flat daily pool (`frontend/src/lib/journalPrompts.ts`)
for the offline/generic nudge. This module holds the *contextual* pools the backend
draws from when it knows something about the user's recent practice — e.g. a prompt
tuned to the last session's type, or a reflective prompt at a streak milestone.

Kept here (not inline in the service or route) so the copy is versioned in one place,
per `.claude/rules/ai-product.md` ("no inline string soup"). These are static,
templated reflections — no LLM call — so they carry no PII and need no validation.

`context` is a stable machine key the frontend can use for an icon/label; `text` is
the user-facing copy.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ContextualPrompt:
    context: str  # stable machine key, e.g. "after_breathing", "streak_7"
    text: str


# After a resonance / energizing breathing sit — invite reflection on the breath.
AFTER_BREATHING: tuple[ContextualPrompt, ...] = (
    ContextualPrompt("after_breathing", "How does your body feel now, after breathing?"),
    ContextualPrompt(
        "after_breathing", "What shifted between your first breath and your last?"
    ),
    ContextualPrompt(
        "after_breathing", "Where do you notice the breath settling in your body?"
    ),
    ContextualPrompt("after_breathing", "What did slowing your breath make a little easier?"),
)

# After a loving-kindness sit — invite reflection on warmth toward self/others.
AFTER_LOVING_KINDNESS: tuple[ContextualPrompt, ...] = (
    ContextualPrompt(
        "after_loving_kindness", "Who came to mind during your loving-kindness practice?"
    ),
    ContextualPrompt(
        "after_loving_kindness", "What kind wish would you offer yourself right now?"
    ),
    ContextualPrompt("after_loving_kindness", "Where in your day could a little more warmth go?"),
    ContextualPrompt("after_loving_kindness", "What felt tender, and what felt open, just now?"),
)

# After any other meditation sit (mindfulness, body scan, walking, …).
AFTER_MEDITATION: tuple[ContextualPrompt, ...] = (
    ContextualPrompt("after_meditation", "What did you notice during or after your sit?"),
    ContextualPrompt("after_meditation", "Was there a moment of stillness, however brief?"),
    ContextualPrompt(
        "after_meditation", "What would you carry from this sit into the rest of your day?"
    ),
    ContextualPrompt("after_meditation", "How did your practice feel today — in body, in mind?"),
)

# Streak milestones — a reflective beat when a run reaches a meaningful length.
STREAK_MILESTONE: dict[int, tuple[ContextualPrompt, ...]] = {
    7: (
        ContextualPrompt("streak_7", "A week of showing up — what's kept you coming back?"),
        ContextualPrompt("streak_7", "Seven days in. What feels different from when you began?"),
    ),
    30: (
        ContextualPrompt("streak_30", "A month of practice — how has it woven into your days?"),
        ContextualPrompt("streak_30", "Thirty days on. What would past-you be glad to hear?"),
    ),
    100: (
        ContextualPrompt(
            "streak_100", "A hundred days. What has this practice quietly taught you?"
        ),
        ContextualPrompt(
            "streak_100", "One hundred days in — what are you grateful you stayed with?"
        ),
    ),
}

# Streak lengths that earn a milestone prompt, largest first (so we surface the
# most significant one a user has reached). Keep in sync with STREAK_MILESTONE keys.
STREAK_MILESTONE_DAYS: tuple[int, ...] = (100, 30, 7)

# A small generic pool used as the backend fallback when there's no usable context
# (no sessions yet, etc.). Mirrors the spirit of the frontend's flat daily pool.
GENERIC: tuple[ContextualPrompt, ...] = (
    ContextualPrompt("generic", "What's on your mind right now?"),
    ContextualPrompt("generic", "What's one small thing you're grateful for right now?"),
    ContextualPrompt("generic", "What emotion has been most present for you today?"),
    ContextualPrompt("generic", "What would you like to let go of before you sleep tonight?"),
)


# Japanese translations keyed by the English text (the definitions above stay the source of
# truth). `localized_text(prompt, locale)` picks the Japanese where available, else English.
_JA: dict[str, str] = {
    "How does your body feel now, after breathing?":
        "呼吸のあと、からだは今どんな感じですか？",
    "What shifted between your first breath and your last?":
        "最初の呼吸と最後の呼吸で、何が変わりましたか？",
    "Where do you notice the breath settling in your body?":
        "からだのどこで、呼吸が落ち着くのを感じますか？",
    "What did slowing your breath make a little easier?":
        "呼吸をゆっくりにして、少し楽になったことは？",
    "Who came to mind during your loving-kindness practice?":
        "慈悲の瞑想のあいだ、誰が心に浮かびましたか？",
    "What kind wish would you offer yourself right now?":
        "今の自分に、どんなやさしい願いを贈りますか？",
    "Where in your day could a little more warmth go?":
        "一日のどこに、もう少しあたたかさを向けられそうですか？",
    "What felt tender, and what felt open, just now?":
        "今、やわらかく感じたもの、開いたと感じたものは？",
    "What did you notice during or after your sit?":
        "瞑想の最中や、そのあとに気づいたことは？",
    "Was there a moment of stillness, however brief?":
        "たとえ一瞬でも、静けさの瞬間はありましたか？",
    "What would you carry from this sit into the rest of your day?":
        "この瞑想から、一日に持っていきたいものは？",
    "How did your practice feel today — in body, in mind?":
        "今日のプラクティスは——からだで、心で、どんな感じでしたか？",
    "A week of showing up — what's kept you coming back?":
        "一週間続けて——また戻ってきたくなるのは、何があるからでしょう？",
    "Seven days in. What feels different from when you began?":
        "七日目。始めた頃と、何が違って感じますか？",
    "A month of practice — how has it woven into your days?":
        "一か月のプラクティス——それは日々にどう織り込まれましたか？",
    "Thirty days on. What would past-you be glad to hear?":
        "三十日目。以前の自分が聞いたら喜ぶことは？",
    "A hundred days. What has this practice quietly taught you?":
        "百日。このプラクティスが、そっと教えてくれたことは？",
    "One hundred days in — what are you grateful you stayed with?":
        "百日目——続けてよかったと思えることは？",
    "What's on your mind right now?":
        "いま、心にあることは？",
    "What's one small thing you're grateful for right now?":
        "いま、感謝できるちいさなことは何ですか？",
    "What emotion has been most present for you today?":
        "今日、いちばん強く感じていた感情は？",
    "What would you like to let go of before you sleep tonight?":
        "眠る前に手放したいものは？",
}


def localized_text(prompt: ContextualPrompt, locale: str = "en") -> str:
    """The prompt's text in the given locale (Japanese where translated, else English)."""
    return _JA.get(prompt.text, prompt.text) if locale == "ja" else prompt.text

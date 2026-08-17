"""AI journal reflection: a short reflective note + one follow-up question.

Mirrors `gratitude_suggester`: the LLM call goes through the provider-agnostic
`llm_client.complete` seam (OpenAI or Anthropic, per settings), model output is
treated as untrusted and validated (shape, non-empty, length caps), and any failure
(no provider, timeout, parse, validation) degrades to a curated fallback pair — this
function never raises. We DO send the journal text to the model (that is the
feature), but we never log it: logs carry metadata only (journal id, model,
ai/fallback). See .claude/rules/ai-product.md.
"""

import json
import logging
import random

from app.prompts.reflection import system_for, user_message
from app.services.ai import llm_client

logger = logging.getLogger(__name__)

# Non-fallback sentinel model label (the live model id now comes from llm_client;
# this constant remains the DB/test label for a "this came from the model" reflection).
MODEL = "claude-haiku-4-5-20251001"
FALLBACK_MODEL = "fallback"
TIMEOUT_SECONDS = 8.0
MAX_TOKENS = 400
MAX_REFLECTION_LEN = 600
MAX_FOLLOWUP_LEN = 200

# Curated generic pairs used whenever the model is unavailable or its output fails
# validation. Deliberately gentle and entry-agnostic — they must read well no matter
# what the person wrote.
FALLBACK_PAIRS: tuple[tuple[str, str], ...] = (
    (
        "Thank you for putting this into words. Writing something down, even briefly, "
        "is its own quiet act of care.",
        "If you read this entry back tomorrow, what might stand out to you?",
    ),
    (
        "There's real attention in what you wrote. Noticing your own experience, "
        "as it is, takes a kind of courage.",
        "What feels most worth remembering from this moment?",
    ),
    (
        "You took a moment to pause and reflect. That alone can soften a busy day.",
        "What would feel like enough for the rest of today?",
    ),
    (
        "Whatever today held, you made a little space to sit with it. That matters.",
        "Is there one small thing here you'd like to carry forward?",
    ),
    (
        "Your words hold a snapshot of this moment, honest and unpolished, "
        "exactly as reflections should be.",
        "What might you say to a friend who wrote this same entry?",
    ),
    (
        "Putting feelings on the page often loosens their grip a little. "
        "You gave yourself that chance just now.",
        "Where in your body do you notice this reflection landing?",
    ),
    (
        "There's no right way to journal, and this entry is proof you showed up anyway.",
        "What's one gentle thing you could offer yourself after writing this?",
    ),
    (
        "Reflections like this one are how patterns slowly become visible. "
        "You're building that picture, entry by entry.",
        "Does anything in this entry echo something you've written before?",
    ),
    (
        "You noticed, you named it, you wrote it down. That's the whole practice, "
        "and you just did it.",
        "What would you like future-you to know about today?",
    ),
    (
        "However this moment felt, giving it words is a way of being on your own side.",
        "If this feeling had a message for you, what might it be?",
    ),
)


def _fallback() -> tuple[str, str, str]:
    reflection, followup = random.choice(FALLBACK_PAIRS)
    return reflection, followup, FALLBACK_MODEL


def _validate(raw: object) -> tuple[str, str] | None:
    """Accept only {"reflection": str, "followup": str} with sane lengths
    (untrusted model output)."""
    if not isinstance(raw, dict):
        return None
    reflection = raw.get("reflection")
    followup = raw.get("followup")
    if not isinstance(reflection, str) or not isinstance(followup, str):
        return None
    reflection, followup = reflection.strip(), followup.strip()
    if not reflection or not followup:
        return None
    if len(reflection) > MAX_REFLECTION_LEN or len(followup) > MAX_FOLLOWUP_LEN:
        return None
    return reflection, followup


def generate(
    body: str,
    mood: str | None = None,
    journal_id: object = None,
    locale: str = "en",
) -> tuple[str, str, str]:
    """Return (reflection_text, followup_question, model) for a journal entry, in the given
    locale's language. Never raises — degrades to a curated (English) fallback pair.
    `journal_id` is only for log metadata; the journal text itself is never logged."""
    try:
        # The seam carries the fail-fast posture (max_retries=0 + timeout): the SDK
        # otherwise retries, so one outage could pin a Starlette threadpool thread for
        # tens of seconds. We fail fast to the curated fallback instead (ai-product.md:
        # don't block on LLM calls).
        result = llm_client.complete(
            system=system_for(locale),
            user=user_message(body, mood),
            max_tokens=MAX_TOKENS,
            timeout=TIMEOUT_SECONDS,
        )
        if result is None:
            raise ValueError("no LLM result")
        text, model_id = result
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("no JSON object in model output")
        validated = _validate(json.loads(text[start : end + 1]))
        if validated is None:
            raise ValueError("model output failed validation")
        logger.info("reflection generated journal_id=%s model=%s", journal_id, model_id)
        return validated[0], validated[1], model_id
    except Exception:
        # Any failure (network, timeout, parse, validation) degrades gracefully.
        # Metadata only — never the journal text.
        logger.warning(
            "reflection coach failed journal_id=%s; using curated fallback",
            journal_id,
            exc_info=False,
        )
        return _fallback()

"""AI-generated gratitude prompt options, with a curated fallback.

The Anthropic SDK is imported lazily so the dependency only loads when the feature
is configured, and so tests can patch `suggest_options` without it. Model output is
treated as untrusted and validated; any failure (no key, timeout, bad shape) falls
back to a curated set. We never send the user's own gratitude text to the model.
See .claude/rules/ai-product.md.
"""

import json
import logging

from app.core.config import settings
from app.prompts.gratitude import SYSTEM, user_message

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
MAX_OPTIONS = 6
MAX_OPTION_LEN = 60
TIMEOUT_SECONDS = 8.0

# Used when the API key is unset, or on any error / timeout / bad output.
FALLBACK_OPTIONS: dict[str, list[str]] = {
    "people": [
        "A friend who checked in on me",
        "Someone who made me laugh",
        "My family's support",
        "A kind stranger",
        "A mentor or teacher",
        "Someone I love",
    ],
    "health": [
        "A good night's sleep",
        "Being able to move my body",
        "A nourishing meal",
        "A moment of rest",
        "My breath, steady and calm",
        "Feeling a little better today",
    ],
    "nature": [
        "Sunlight on my face",
        "Fresh air outside",
        "A walk I took",
        "The sound of rain",
        "A tree or plant nearby",
        "The quiet of early morning",
    ],
    "experiences": [
        "Something that made me smile",
        "A good conversation",
        "Music I enjoyed",
        "A small adventure",
        "A moment of stillness",
        "Something new I tried",
    ],
    "growth": [
        "A small win today",
        "Something I learned",
        "Progress on a goal",
        "Getting through something hard",
        "A mistake I grew from",
        "An opportunity ahead of me",
    ],
    "home": [
        "A warm, safe place to be",
        "My favorite spot at home",
        "A comforting routine",
        "A cup of coffee or tea",
        "Quiet at the end of the day",
        "Something that makes home feel like home",
    ],
    "self": [
        "Something I did well",
        "A quality I'm proud of",
        "Showing up for myself today",
        "My own resilience",
        "Taking time to breathe",
        "Being kind to myself",
    ],
    "simple_pleasures": [
        "My first sip of coffee",
        "A warm shower",
        "A good stretch",
        "Comfortable clothes",
        "A small treat",
        "A moment of peace and quiet",
    ],
}


def _fallback(category: str) -> list[str]:
    return FALLBACK_OPTIONS.get(category, FALLBACK_OPTIONS["experiences"])


def _validate(raw: object) -> list[str] | None:
    """Accept only a list of short, non-empty strings (untrusted model output)."""
    if not isinstance(raw, list):
        return None
    cleaned = [
        item.strip()
        for item in raw
        if isinstance(item, str) and item.strip() and len(item.strip()) <= MAX_OPTION_LEN
    ]
    return cleaned[:MAX_OPTIONS] or None


def suggest_options(category: str) -> list[str]:
    """Return ~6 gratitude prompts for a category. Never raises — degrades to fallback."""
    if not settings.anthropic_api_key:
        return _fallback(category)
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key, timeout=TIMEOUT_SECONDS
        )
        message = client.messages.create(
            model=MODEL,
            max_tokens=300,
            temperature=1.0,
            system=SYSTEM,
            messages=[{"role": "user", "content": user_message(category)}],
        )
        text = "".join(b.text for b in message.content if b.type == "text")
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end == -1:
            raise ValueError("no JSON array in model output")
        options = _validate(json.loads(text[start : end + 1]))
        if options is None:
            raise ValueError("model output failed validation")
        return options
    except Exception:
        # Any failure (network, timeout, parse, validation) degrades gracefully.
        logger.warning("gratitude suggester failed; using curated fallback", exc_info=False)
        return _fallback(category)

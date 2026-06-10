"""AI-generated gratitude prompt options, with a curated fallback.

The Anthropic SDK is imported lazily so the dependency only loads when the feature
is configured, and so tests can patch `suggest_options` without it. Model output is
treated as untrusted and validated; any failure (no key, timeout, bad shape) falls
back to a curated set. The curated pools live in `gratitude_fallback.json` (~90 per
category) and are sampled randomly, so the "show different ideas" reload feels fresh
even without a key. We never send the user's own gratitude text to the model.
See .claude/rules/ai-product.md.
"""

import json
import logging
import random
from pathlib import Path

from app.core.config import settings
from app.prompts.gratitude import SYSTEM, user_message

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
MAX_OPTIONS = 10
MAX_OPTION_LEN = 60
TIMEOUT_SECONDS = 8.0

_FALLBACK_PATH = Path(__file__).with_name("gratitude_fallback.json")

# Last-resort set if a category is missing or the data file can't be read.
_GENERIC = [
    "A breath of fresh air",
    "Someone I care about",
    "A small win today",
    "A moment of peace",
    "Something that made me smile",
    "A warm drink",
    "A roof over my head",
    "A good night's rest",
    "A kind word",
    "Simply being here",
]


def _load_pools() -> dict[str, list[str]]:
    try:
        with _FALLBACK_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
        return {k: list(v) for k, v in data.items() if isinstance(v, list)}
    except Exception:
        logger.warning("could not load gratitude fallback pools; using a generic set")
        return {}


# Loaded once at import (the file is static curated content).
FALLBACK_OPTIONS: dict[str, list[str]] = _load_pools()


def _fallback(category: str) -> list[str]:
    pool = FALLBACK_OPTIONS.get(category) or FALLBACK_OPTIONS.get("experiences") or _GENERIC
    return random.sample(pool, min(MAX_OPTIONS, len(pool)))


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
    """Return ~10 gratitude prompts for a category. Never raises — degrades to fallback."""
    if not settings.anthropic_api_key:
        return _fallback(category)
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key, timeout=TIMEOUT_SECONDS
        )
        message = client.messages.create(
            model=MODEL,
            max_tokens=500,
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

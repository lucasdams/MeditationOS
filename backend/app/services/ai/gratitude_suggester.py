"""AI-generated gratitude prompt options, with a curated fallback.

The LLM call goes through the provider-agnostic `llm_client.complete` seam (OpenAI or
Anthropic, per settings), so tests can patch either `suggest_options` or that seam.
Model output is treated as untrusted and validated; any failure (no provider
configured, timeout, bad shape) falls back to a curated set. The curated pools live in
`gratitude_fallback.json` (~90 per category) and are sampled randomly, so the "show
different ideas" reload feels fresh even without a key. We never send the user's own
gratitude text to the model. See .claude/rules/ai-product.md.
"""

import json
import logging
import random
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.prompts.gratitude import system_for, user_message
from app.services.ai import llm_client

logger = logging.getLogger(__name__)

MAX_OPTIONS = 10
MAX_OPTION_LEN = 60
TIMEOUT_SECONDS = 8.0

# Per-user daily budget for LLM-backed suggestions — a per-user cost ceiling on top of the
# per-IP rate limit (.claude/rules/ai-product.md). Over the cap the endpoint quietly serves
# the curated fallback pool (still fresh — randomly sampled ~90/category) instead of calling
# the model, so the "show different ideas" reload keeps working with zero user-visible error.
# In-memory / per-worker, matching the codebase's other in-memory caps (Redis is the future
# step). Bucketed by UTC day; a cost guard doesn't need local-midnight precision.
DAILY_LLM_CAP = 30
_daily_llm_counts: dict[uuid.UUID, tuple[str, int]] = {}
_daily_llm_lock = threading.Lock()


def _llm_budget_available(user_id: uuid.UUID) -> bool:
    """Count one LLM-backed suggestion against the user's daily budget; return False once
    the cap is reached (resets at UTC midnight)."""
    today = datetime.now(UTC).date().isoformat()
    with _daily_llm_lock:
        day, count = _daily_llm_counts.get(user_id, (today, 0))
        if day != today:
            count = 0  # new UTC day → fresh allowance
        if count >= DAILY_LLM_CAP:
            return False
        _daily_llm_counts[user_id] = (today, count + 1)
        return True

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
    """Accept only a list of short, non-empty, de-duplicated strings (untrusted output).

    De-dup is case-insensitive and order-preserving so a model that repeats an option
    can't produce duplicate React keys / a doubled chip on the client."""
    if not isinstance(raw, list):
        return None
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        s = item.strip()
        if s and len(s) <= MAX_OPTION_LEN and s.casefold() not in seen:
            seen.add(s.casefold())
            cleaned.append(s)
    return cleaned[:MAX_OPTIONS] or None


def suggest_options(
    category: str, locale: str = "en", *, user_id: uuid.UUID | None = None
) -> list[str]:
    """Return ~10 gratitude prompts for a category, in the given locale's language. Never
    raises — degrades to the curated (English) fallback. When `user_id` is given and that
    user's daily LLM budget is spent, skips the model and serves the curated fallback."""
    if user_id is not None and not _llm_budget_available(user_id):
        return _fallback(category)
    try:
        result = llm_client.complete(
            system=system_for(locale),
            user=user_message(category),
            max_tokens=500,
            timeout=TIMEOUT_SECONDS,
        )
        if result is None:
            raise ValueError("no LLM result")
        text, _model = result
        start, end = text.find("["), text.rfind("]")
        if start == -1 or end == -1:
            raise ValueError("no JSON array in model output")
        options = _validate(json.loads(text[start : end + 1]))
        if options is None:
            raise ValueError("model output failed validation")
        return options
    except Exception:
        # Any failure (no provider, timeout, parse, validation) degrades gracefully.
        logger.warning("gratitude suggester failed; using curated fallback", exc_info=False)
        return _fallback(category)

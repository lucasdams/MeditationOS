"""Provider-agnostic LLM completion seam for the AI features.

Both AI services (gratitude suggester, reflection coach) call `complete()` instead
of talking to a provider SDK directly. It picks a PRIMARY provider from
`settings.llm_provider`, tries it, and falls back to the OTHER provider only when
that provider's key is configured. Any failure or missing configuration returns
`None`, so callers degrade to their curated fallback — this function never raises.

Each provider's SDK is imported lazily (mirroring the original inline
`import anthropic`), so the app runs even if one SDK isn't installed, and each
provider returns `None` when its API key is empty.

We keep the fail-fast posture from the original services: `max_retries=0` plus a
caller-supplied timeout, so one provider's outage can't pin a request thread by
retrying under the hood.

Logging is metadata only — provider, model, success/failure. We never log the
system prompt, the user content, or the model's response text. See
.claude/rules/ai-product.md.
"""

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# GPT-5 reasoning models can spend the completion budget on hidden reasoning tokens
# before emitting any visible answer. Floor the OpenAI budget well above the caller's
# intent so the visible response isn't starved. Applied only on the OpenAI path.
_OPENAI_MIN_COMPLETION_TOKENS = 2048


def _openai_complete(
    *, system: str, user: str, max_tokens: int, timeout: float
) -> tuple[str, str] | None:
    """Complete via OpenAI Chat Completions. Returns (text, model) or None on any
    failure/misconfiguration. Never raises."""
    if not settings.openai_api_key:
        return None
    model = settings.openai_model
    try:
        import openai

        client = openai.OpenAI(
            api_key=settings.openai_api_key,
            timeout=timeout,
            max_retries=0,  # fail fast to the caller's fallback; don't retry under the hood
        )
        # GPT-5 models use `max_completion_tokens` (not `max_tokens`) and reject a
        # custom `temperature`, so we omit temperature entirely. `reasoning_effort`
        # keeps these simple tasks cheap/fast.
        request = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_completion_tokens": max(max_tokens, _OPENAI_MIN_COMPLETION_TOKENS),
        }
        try:
            resp = client.chat.completions.create(reasoning_effort="minimal", **request)
        except (TypeError, openai.BadRequestError):
            # The installed SDK or the model rejected `reasoning_effort`; retry once
            # without it rather than force a silent fallback on every call.
            resp = client.chat.completions.create(**request)
        text = ""
        if resp.choices:
            text = (resp.choices[0].message.content or "").strip()
        if not text:
            raise ValueError("empty OpenAI response")
        logger.info("llm complete provider=openai model=%s ok", model)
        return text, model
    except Exception:
        logger.warning("llm complete provider=openai model=%s failed", model, exc_info=False)
        return None


def _anthropic_complete(
    *, system: str, user: str, max_tokens: int, timeout: float
) -> tuple[str, str] | None:
    """Complete via the Anthropic Messages API. Returns (text, model) or None on any
    failure/misconfiguration. Never raises."""
    if not settings.anthropic_api_key:
        return None
    model = settings.anthropic_model
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=timeout,
            max_retries=0,  # fail fast to the caller's fallback (see module docstring)
        )
        message = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=1.0,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in message.content if b.type == "text").strip()
        if not text:
            raise ValueError("empty Anthropic response")
        logger.info("llm complete provider=anthropic model=%s ok", model)
        return text, model
    except Exception:
        logger.warning("llm complete provider=anthropic model=%s failed", model, exc_info=False)
        return None


_PROVIDERS = {"openai": _openai_complete, "anthropic": _anthropic_complete}


def complete(
    *, system: str, user: str, max_tokens: int, timeout: float
) -> tuple[str, str] | None:
    """Complete a prompt via the configured LLM provider.

    Returns `(raw_text, model_id)` on success, or `None` on any failure or
    misconfiguration. Never raises. Tries the PRIMARY provider (`settings.llm_provider`)
    first, then the OTHER provider as a secondary — each provider self-guards on its own
    API key, so the secondary is only actually attempted when its key is configured.
    """
    primary = settings.llm_provider.strip().lower()
    if primary not in _PROVIDERS:
        primary = "openai"
    secondary = "anthropic" if primary == "openai" else "openai"

    for name in (primary, secondary):
        result = _PROVIDERS[name](
            system=system, user=user, max_tokens=max_tokens, timeout=timeout
        )
        if result is not None:
            return result
    return None

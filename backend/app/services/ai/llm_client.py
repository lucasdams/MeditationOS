"""Provider-agnostic LLM seam for the AI features.

Both single-shot features (gratitude suggester, reflection coach) call `complete()`,
and the multi-turn philosopher chat calls `chat()`. Both pick a PRIMARY provider from
`settings.llm_provider`, try it, and fall back to the OTHER provider only when that
provider's key is configured. Any failure or missing configuration returns `None`, so
callers degrade to their curated fallback — these functions never raise.

`complete()` is a thin wrapper over `chat()` with a single user turn, so the two share
one implementation per provider (same fail-fast client, same GPT-5 request shape, same
metadata-only logging). The only difference is the message list passed to the provider.

Each provider's SDK is imported lazily (mirroring the original inline
`import anthropic`), so the app runs even if one SDK isn't installed, and each provider
returns `None` when its API key is empty.

We keep the fail-fast posture from the original services: `max_retries=0` plus a
caller-supplied timeout, so one provider's outage can't pin a request thread by
retrying under the hood.

Logging is metadata only — provider, model, success/failure. We never log the system
prompt, the user/message content, or the model's response text. See
.claude/rules/ai-product.md.
"""

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# GPT-5 reasoning models can spend the completion budget on hidden reasoning tokens
# before emitting any visible answer. Floor the OpenAI budget well above the caller's
# intent so the visible response isn't starved. Applied only on the OpenAI path.
_OPENAI_MIN_COMPLETION_TOKENS = 2048

# One chat turn as passed to a provider: {"role": "user"|"assistant", "content": str}.
Message = dict[str, str]


def _openai_chat(
    *,
    system: str,
    messages: list[Message],
    max_tokens: int,
    timeout: float,
    temperature: float | None = None,
) -> tuple[str, str] | None:
    """Chat via OpenAI Chat Completions. Returns (text, model) or None on any
    failure/misconfiguration. Never raises.

    `temperature` is accepted for a uniform seam but deliberately NOT sent: GPT-5 models
    reject a custom temperature (see below), so per-guide temperature is a no-op here and
    only bites on providers that honour it (Anthropic)."""
    del temperature  # unsupported on the GPT-5 path; kept in the signature for parity
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
        # keeps these simple tasks cheap/fast. The system prompt leads, then the
        # conversation turns in order.
        request = {
            "model": model,
            "messages": [{"role": "system", "content": system}, *messages],
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
        logger.info("llm provider=openai model=%s ok", model)
        return text, model
    except Exception:
        logger.warning("llm provider=openai model=%s failed", model, exc_info=False)
        return None


def _anthropic_chat(
    *,
    system: str,
    messages: list[Message],
    max_tokens: int,
    timeout: float,
    temperature: float | None = None,
) -> tuple[str, str] | None:
    """Chat via the Anthropic Messages API. Returns (text, model) or None on any
    failure/misconfiguration. Never raises. Honours a per-call `temperature` (falling back
    to 1.0), which is how per-guide tuning takes effect on this provider."""
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
            temperature=temperature if temperature is not None else 1.0,
            system=system,
            messages=messages,
        )
        text = "".join(b.text for b in message.content if b.type == "text").strip()
        if not text:
            raise ValueError("empty Anthropic response")
        logger.info("llm provider=anthropic model=%s ok", model)
        return text, model
    except Exception:
        logger.warning("llm provider=anthropic model=%s failed", model, exc_info=False)
        return None


_PROVIDERS = {"openai": _openai_chat, "anthropic": _anthropic_chat}


def _ordered_providers() -> tuple[str, str]:
    """(primary, secondary) provider names. Primary is `settings.llm_provider`
    (defaulting to openai for an unknown value); the secondary is the other one —
    each provider self-guards on its own API key, so the secondary is only actually
    attempted when its key is configured."""
    primary = settings.llm_provider.strip().lower()
    if primary not in _PROVIDERS:
        primary = "openai"
    secondary = "anthropic" if primary == "openai" else "openai"
    return primary, secondary


def chat(
    *,
    system: str,
    messages: list[Message],
    max_tokens: int,
    timeout: float,
    temperature: float | None = None,
) -> tuple[str, str] | None:
    """Continue a multi-turn conversation via the configured LLM provider.

    `messages` is the ordered conversation history, each turn
    `{"role": "user"|"assistant", "content": str}` (ending on a user turn). `temperature`
    is an optional per-call override (used for per-guide tuning); providers that don't
    honour it ignore it. Returns `(raw_text, model_id)` on success, or `None` on any
    failure or misconfiguration. Never raises. Tries the PRIMARY provider first, then the
    OTHER provider as a secondary (each self-guards on its own key).
    """
    for name in _ordered_providers():
        result = _PROVIDERS[name](
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            timeout=timeout,
            temperature=temperature,
        )
        if result is not None:
            return result
    return None


def complete(
    *, system: str, user: str, max_tokens: int, timeout: float
) -> tuple[str, str] | None:
    """Complete a single prompt via the configured LLM provider.

    A thin wrapper over `chat()` with one user turn — same primary→secondary cascade,
    same per-provider request shape and fail-fast posture. Returns `(raw_text,
    model_id)` on success, or `None` on any failure/misconfiguration. Never raises.
    """
    return chat(
        system=system,
        messages=[{"role": "user", "content": user}],
        max_tokens=max_tokens,
        timeout=timeout,
    )

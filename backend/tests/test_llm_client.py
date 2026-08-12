"""Tests for the provider-agnostic LLM completion seam (`app.services.ai.llm_client`).

Provider SDKs are patched at their import site — we never make a real network call.
We assert: no keys → None, primary/secondary selection, per-provider success returning
(text, model), provider error → None, the secondary-fallback path (primary key empty or
primary errors, secondary key set → uses secondary), and the OpenAI GPT-5 request shape
(max_completion_tokens floor, reasoning_effort, no temperature, fail-fast client).
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.services.ai import llm_client


def _openai_response(text):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


def _anthropic_message(text):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])


def _set(monkeypatch, **kwargs):
    for key, value in kwargs.items():
        monkeypatch.setattr(settings, key, value)


# ── No provider configured ────────────────────────────────────────────────────


def test_no_keys_returns_none(monkeypatch):
    _set(monkeypatch, openai_api_key="", anthropic_api_key="", llm_provider="openai")
    assert llm_client.complete(system="s", user="u", max_tokens=100, timeout=1.0) is None


# ── OpenAI success + request shape ────────────────────────────────────────────


def test_openai_success_returns_text_and_model(monkeypatch):
    _set(
        monkeypatch,
        llm_provider="openai",
        openai_api_key="sk-test",
        openai_model="gpt-5-nano",
        anthropic_api_key="",
    )
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _openai_response('{"reflection": "ok"}')

    with patch("openai.OpenAI", return_value=fake_client) as ctor:
        result = llm_client.complete(system="sys", user="usr", max_tokens=400, timeout=8.0)

    assert result == ('{"reflection": "ok"}', "gpt-5-nano")
    # Fail-fast client posture carried through.
    ctor_kwargs = ctor.call_args.kwargs
    assert ctor_kwargs["max_retries"] == 0
    assert ctor_kwargs["timeout"] == 8.0
    # GPT-5 request params: budget floored above the caller's intent, reasoning_effort
    # minimal, no custom temperature, and the GPT-5 token param name.
    call_kwargs = fake_client.chat.completions.create.call_args.kwargs
    assert call_kwargs["max_completion_tokens"] == 2048
    assert call_kwargs["reasoning_effort"] == "minimal"
    assert "temperature" not in call_kwargs
    assert "max_tokens" not in call_kwargs
    assert call_kwargs["model"] == "gpt-5-nano"


def test_openai_budget_floor_respects_larger_caller_value(monkeypatch):
    _set(monkeypatch, llm_provider="openai", openai_api_key="sk-test", anthropic_api_key="")
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _openai_response("ok")

    with patch("openai.OpenAI", return_value=fake_client):
        llm_client.complete(system="s", user="u", max_tokens=5000, timeout=8.0)

    assert fake_client.chat.completions.create.call_args.kwargs["max_completion_tokens"] == 5000


def test_openai_retries_without_reasoning_effort_on_kwarg_reject(monkeypatch):
    _set(monkeypatch, llm_provider="openai", openai_api_key="sk-test", anthropic_api_key="")
    calls = []

    def _create(**kwargs):
        calls.append(kwargs)
        if "reasoning_effort" in kwargs:
            raise TypeError("unexpected keyword argument 'reasoning_effort'")
        return _openai_response("second-try text")

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = _create

    with patch("openai.OpenAI", return_value=fake_client):
        result = llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0)

    assert result == ("second-try text", settings.openai_model)
    assert len(calls) == 2
    assert "reasoning_effort" not in calls[1]


def test_openai_empty_content_is_failure(monkeypatch):
    _set(monkeypatch, llm_provider="openai", openai_api_key="sk-test", anthropic_api_key="")
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _openai_response(None)

    with patch("openai.OpenAI", return_value=fake_client):
        assert llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0) is None


# ── Anthropic success + request shape ─────────────────────────────────────────


def test_anthropic_success_returns_text_and_model(monkeypatch):
    _set(
        monkeypatch,
        llm_provider="anthropic",
        anthropic_api_key="sk-ant",
        anthropic_model="claude-test",
        openai_api_key="",
    )
    fake_client = MagicMock()
    fake_client.messages.create.return_value = _anthropic_message("reflect text")

    with patch("anthropic.Anthropic", return_value=fake_client) as ctor:
        result = llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0)

    assert result == ("reflect text", "claude-test")
    assert ctor.call_args.kwargs["max_retries"] == 0
    assert ctor.call_args.kwargs["timeout"] == 8.0
    call_kwargs = fake_client.messages.create.call_args.kwargs
    assert call_kwargs["max_tokens"] == 400
    assert call_kwargs["temperature"] == 1.0
    assert call_kwargs["model"] == "claude-test"


# ── Provider selection ────────────────────────────────────────────────────────


def test_primary_provider_is_tried_first(monkeypatch):
    # Both keys present, primary=anthropic → OpenAI is never touched.
    _set(
        monkeypatch,
        llm_provider="anthropic",
        openai_api_key="sk-test",
        anthropic_api_key="sk-ant",
        anthropic_model="claude-test",
    )
    fake_openai = MagicMock()
    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.return_value = _anthropic_message("anthropic first")

    with (
        patch("openai.OpenAI", return_value=fake_openai),
        patch("anthropic.Anthropic", return_value=fake_anthropic),
    ):
        result = llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0)

    assert result == ("anthropic first", "claude-test")
    fake_openai.chat.completions.create.assert_not_called()


def test_unknown_provider_defaults_to_openai(monkeypatch):
    _set(monkeypatch, llm_provider="bogus", openai_api_key="sk-test", anthropic_api_key="")
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _openai_response("ok")

    with patch("openai.OpenAI", return_value=fake_client):
        result = llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0)

    assert result == ("ok", settings.openai_model)


# ── Secondary-fallback path ───────────────────────────────────────────────────


def test_secondary_used_when_primary_key_empty(monkeypatch):
    # Primary=openai but no OpenAI key; anthropic secondary key set → uses anthropic.
    _set(
        monkeypatch,
        llm_provider="openai",
        openai_api_key="",
        anthropic_api_key="sk-ant",
        anthropic_model="claude-test",
    )
    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.return_value = _anthropic_message("from secondary")

    with patch("anthropic.Anthropic", return_value=fake_anthropic):
        result = llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0)

    assert result == ("from secondary", "claude-test")


def test_primary_error_falls_back_to_secondary(monkeypatch):
    _set(
        monkeypatch,
        llm_provider="openai",
        openai_api_key="sk-test",
        anthropic_api_key="sk-ant",
        anthropic_model="claude-test",
    )
    fake_openai = MagicMock()
    fake_openai.chat.completions.create.side_effect = RuntimeError("down")
    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.return_value = _anthropic_message("secondary win")

    with (
        patch("openai.OpenAI", return_value=fake_openai),
        patch("anthropic.Anthropic", return_value=fake_anthropic),
    ):
        result = llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0)

    assert result == ("secondary win", "claude-test")


def test_provider_error_returns_none_when_no_secondary(monkeypatch):
    _set(monkeypatch, llm_provider="openai", openai_api_key="sk-test", anthropic_api_key="")
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = RuntimeError("boom")

    with patch("openai.OpenAI", return_value=fake_client):
        assert llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0) is None


def test_both_providers_fail_returns_none(monkeypatch):
    _set(
        monkeypatch,
        llm_provider="openai",
        openai_api_key="sk-test",
        anthropic_api_key="sk-ant",
    )
    fake_openai = MagicMock()
    fake_openai.chat.completions.create.side_effect = RuntimeError("down")
    fake_anthropic = MagicMock()
    fake_anthropic.messages.create.side_effect = RuntimeError("also down")

    with (
        patch("openai.OpenAI", return_value=fake_openai),
        patch("anthropic.Anthropic", return_value=fake_anthropic),
    ):
        assert llm_client.complete(system="s", user="u", max_tokens=400, timeout=8.0) is None

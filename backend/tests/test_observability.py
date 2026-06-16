"""Tests for the Sentry observability module.

Key properties verified:
- ``init_sentry`` with an empty DSN is a pure no-op.
- PII scrubbing removes request bodies, sensitive headers, and known PII keys.
- Query strings are stripped from ``request.url``, ``query_string``, and
  ``transaction`` so single-use tokens (email-verify, password-reset) are
  never transmitted to Sentry.
- ``_scrub_dict`` recurses into lists of dicts, not only nested dicts.
- ``contexts`` is scrubbed in addition to ``extra``.
- The app boots and serves requests with no SENTRY_DSN configured (no-op path).
"""

from app.core.observability import (
    _scrub_dict,
    _scrub_headers,
    _strip_query,
    before_send,
    before_send_transaction,
    init_sentry,
)

# ---------------------------------------------------------------------------
# init_sentry no-op
# ---------------------------------------------------------------------------


def test_init_sentry_no_dsn_is_noop():
    """Calling init_sentry with an empty DSN must not raise and must not call
    sentry_sdk.init (verified by checking that the SDK hub has no client)."""
    import sentry_sdk

    # Ensure any previous init is cleared.
    sentry_sdk.init()  # resets to a no-op client

    init_sentry(dsn="", environment="test", traces_sample_rate=0.0)

    client = sentry_sdk.get_client()
    # After a bare sentry_sdk.init() the client is a NoopClient — its DSN is None.
    assert client.options.get("dsn") in (None, ""), (
        "init_sentry(dsn='') must not initialise a real Sentry client"
    )


def test_init_sentry_disables_local_variables_and_body(monkeypatch):
    """When a DSN is provided, init must pass include_local_variables=False
    and max_request_body_size='never' to prevent frame locals leaking PII."""
    import sentry_sdk

    captured: dict = {}

    def _fake_init(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(sentry_sdk, "init", _fake_init)
    init_sentry(
        dsn="https://fake@o0.ingest.sentry.io/0",
        environment="test",
        traces_sample_rate=0.0,
    )

    assert captured.get("include_local_variables") is False, (
        "include_local_variables must be False to prevent frame locals from "
        "leaking plaintext passwords, JWTs, and decrypted wellness content"
    )
    assert captured.get("max_request_body_size") == "never", (
        "max_request_body_size must be 'never' as defense-in-depth against "
        "body content bypassing the before_send scrubber"
    )


# ---------------------------------------------------------------------------
# _strip_query
# ---------------------------------------------------------------------------


def test_strip_query_removes_token_from_full_url():
    url = "https://app.example.com/verify-email?token=SECRET&other=x"
    assert _strip_query(url) == "https://app.example.com/verify-email"


def test_strip_query_removes_token_from_path_only():
    url = "/reset-password?token=SECRET"
    assert _strip_query(url) == "/reset-password"


def test_strip_query_leaves_path_only_url_unchanged():
    url = "https://app.example.com/api/v1/sessions"
    assert _strip_query(url) == url


def test_strip_query_none_returns_none():
    assert _strip_query(None) is None


def test_strip_query_empty_string_returns_empty():
    assert _strip_query("") == ""


# ---------------------------------------------------------------------------
# Header scrubbing
# ---------------------------------------------------------------------------


def test_scrub_headers_removes_sensitive():
    headers = {
        "authorization": "Bearer secret-token",
        "cookie": "session=abc123",
        "set-cookie": "id=xyz; HttpOnly",
        "x-auth-token": "tok",
        "content-type": "application/json",
        "accept": "*/*",
    }
    scrubbed = _scrub_headers(headers)
    assert scrubbed["authorization"] == "[Filtered]"
    assert scrubbed["cookie"] == "[Filtered]"
    assert scrubbed["set-cookie"] == "[Filtered]"
    assert scrubbed["x-auth-token"] == "[Filtered]"
    # Safe headers are preserved.
    assert scrubbed["content-type"] == "application/json"
    assert scrubbed["accept"] == "*/*"


def test_scrub_headers_none_safe():
    assert _scrub_headers(None) is None


def test_scrub_headers_empty_dict():
    assert _scrub_headers({}) == {}


# ---------------------------------------------------------------------------
# Dict scrubbing (extra / contexts)
# ---------------------------------------------------------------------------


def test_scrub_dict_removes_pii_keys():
    data = {
        "user_id": "abc",
        "email": "user@example.com",
        "password": "hunter2",
        "token": "tok",
        "route": "/api/v1/sessions",
        "journal": "Dear diary…",
        "gratitude": "I'm grateful for…",
        "mood": "7",
        "heart_rate": 72,
        "hrv": 45.3,
        "note": "private note",
    }
    scrubbed = _scrub_dict(data)
    # PII fields must be filtered.
    assert scrubbed["email"] == "[Filtered]"
    assert scrubbed["password"] == "[Filtered]"
    assert scrubbed["token"] == "[Filtered]"
    assert scrubbed["journal"] == "[Filtered]"
    assert scrubbed["gratitude"] == "[Filtered]"
    assert scrubbed["mood"] == "[Filtered]"
    assert scrubbed["heart_rate"] == "[Filtered]"
    assert scrubbed["hrv"] == "[Filtered]"
    assert scrubbed["note"] == "[Filtered]"
    # Non-PII fields must be kept.
    assert scrubbed["user_id"] == "abc"
    assert scrubbed["route"] == "/api/v1/sessions"


def test_scrub_dict_nested():
    data = {"meta": {"email": "x@y.com", "route": "/health"}}
    scrubbed = _scrub_dict(data)
    assert scrubbed["meta"]["email"] == "[Filtered]"
    assert scrubbed["meta"]["route"] == "/health"


def test_scrub_dict_none():
    assert _scrub_dict(None) is None


def test_scrub_dict_recurses_into_list_of_dicts():
    """PII keys inside a list of dicts must be scrubbed (regression: was skipped)."""
    data = {
        "entries": [
            {"email": "a@b.com", "route": "/health"},
            {"token": "abc", "count": 5},
        ]
    }
    scrubbed = _scrub_dict(data)
    assert scrubbed["entries"][0]["email"] == "[Filtered]"
    assert scrubbed["entries"][0]["route"] == "/health"
    assert scrubbed["entries"][1]["token"] == "[Filtered]"
    assert scrubbed["entries"][1]["count"] == 5


# ---------------------------------------------------------------------------
# before_send / before_send_transaction
# ---------------------------------------------------------------------------


def _make_event(
    with_body: bool = True,
    with_extra: bool = False,
    url: str = "/api/v1/journals",
    query_string: str | None = None,
    transaction: str | None = None,
    with_contexts: bool = False,
) -> dict:
    event: dict = {
        "exception": {"values": [{"type": "ValueError", "value": "bad input"}]},
        "request": {
            "url": url,
            "method": "POST",
            "headers": {
                "authorization": "Bearer tok",
                "content-type": "application/json",
            },
        },
    }
    if with_body:
        event["request"]["data"] = '{"text": "My journal entry"}'
    if query_string is not None:
        event["request"]["query_string"] = query_string
    if with_extra:
        event["extra"] = {"email": "user@example.com", "request_id": "abc"}
    if with_contexts:
        event["contexts"] = {"user_profile": {"email": "u@example.com", "plan": "free"}}
    if transaction is not None:
        event["transaction"] = transaction
    return event


def test_before_send_strips_request_body():
    event = _make_event(with_body=True)
    result = before_send(event, {})
    assert result is not None
    assert "data" not in result["request"]


def test_before_send_scrubs_auth_header():
    event = _make_event()
    result = before_send(event, {})
    assert result["request"]["headers"]["authorization"] == "[Filtered]"
    assert result["request"]["headers"]["content-type"] == "application/json"


def test_before_send_scrubs_extra_pii():
    event = _make_event(with_extra=True)
    result = before_send(event, {})
    assert result["extra"]["email"] == "[Filtered]"
    assert result["extra"]["request_id"] == "abc"


def test_before_send_no_request_key():
    """Events without a request key must pass through safely."""
    event = {"exception": {"values": [{"type": "RuntimeError", "value": "boom"}]}}
    result = before_send(event, {})
    assert result is not None
    assert "request" not in result


def test_before_send_transaction_strips_body():
    event = _make_event(with_body=True)
    result = before_send_transaction(event, {})
    assert result is not None
    assert "data" not in result["request"]


# ---------------------------------------------------------------------------
# NEW: query-string / token scrubbing
# ---------------------------------------------------------------------------


def test_before_send_strips_token_from_url():
    """Single-use tokens in ?token=… must be gone from request.url."""
    event = _make_event(url="https://app.example.com/verify-email?token=SECRET123")
    result = before_send(event, {})
    assert result is not None
    assert "SECRET123" not in result["request"]["url"]
    assert "?" not in result["request"]["url"]
    assert result["request"]["url"] == "https://app.example.com/verify-email"


def test_before_send_clears_query_string_field():
    """request.query_string must be removed entirely."""
    event = _make_event(
        url="https://app.example.com/verify-email?token=SECRET",
        query_string="token=SECRET",
    )
    result = before_send(event, {})
    assert "query_string" not in result["request"]


def test_before_send_transaction_strips_token_from_transaction():
    """transaction field must not carry raw-URL query strings."""
    event = _make_event(
        url="https://app.example.com/verify-email?token=SECRET",
        query_string="token=SECRET",
        transaction="https://app.example.com/verify-email?token=SECRET",
    )
    result = before_send_transaction(event, {})
    assert result is not None
    assert "SECRET" not in result["transaction"]
    assert result["transaction"] == "https://app.example.com/verify-email"
    assert "query_string" not in result["request"]


def test_before_send_transaction_named_endpoint_unchanged():
    """Route-pattern transaction names (endpoint style) pass through untouched."""
    event = _make_event(transaction="/api/v1/users/{user_id}")
    result = before_send_transaction(event, {})
    assert result["transaction"] == "/api/v1/users/{user_id}"


# ---------------------------------------------------------------------------
# NEW: contexts scrubbing
# ---------------------------------------------------------------------------


def test_before_send_scrubs_contexts_pii():
    """PII in event.contexts must be scrubbed (email key in user_profile)."""
    event = _make_event(with_contexts=True)
    result = before_send(event, {})
    assert result["contexts"]["user_profile"]["email"] == "[Filtered]"
    assert result["contexts"]["user_profile"]["plan"] == "free"


# ---------------------------------------------------------------------------
# App boots with no SENTRY_DSN (integration — reuses the client fixture)
# ---------------------------------------------------------------------------


def test_app_serves_with_no_sentry_dsn(client):
    """The app must respond normally when SENTRY_DSN is not configured.

    This reuses the shared test client fixture which imports app.main with
    ENVIRONMENT=test and no SENTRY_DSN, confirming the no-op path is live.
    """
    response = client.get("/api/v1/health")
    assert response.status_code == 200

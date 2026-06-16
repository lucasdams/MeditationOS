"""Tests for the Sentry observability module.

Key properties verified:
- ``init_sentry`` with an empty DSN is a pure no-op.
- PII scrubbing removes request bodies, sensitive headers, and known PII keys.
- The app boots and serves requests with no SENTRY_DSN configured (no-op path).
"""

from app.core.observability import (
    _scrub_dict,
    _scrub_headers,
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
# Dict scrubbing (extra context)
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


# ---------------------------------------------------------------------------
# before_send / before_send_transaction
# ---------------------------------------------------------------------------


def _make_event(with_body: bool = True, with_extra: bool = False) -> dict:
    event: dict = {
        "exception": {"values": [{"type": "ValueError", "value": "bad input"}]},
        "request": {
            "url": "/api/v1/journals",
            "method": "POST",
            "headers": {
                "authorization": "Bearer tok",
                "content-type": "application/json",
            },
        },
    }
    if with_body:
        event["request"]["data"] = '{"text": "My journal entry"}'
    if with_extra:
        event["extra"] = {"email": "user@example.com", "request_id": "abc"}
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
# App boots with no SENTRY_DSN (integration — reuses the client fixture)
# ---------------------------------------------------------------------------


def test_app_serves_with_no_sentry_dsn(client):
    """The app must respond normally when SENTRY_DSN is not configured.

    This reuses the shared test client fixture which imports app.main with
    ENVIRONMENT=test and no SENTRY_DSN, confirming the no-op path is live.
    """
    response = client.get("/api/v1/health")
    assert response.status_code == 200

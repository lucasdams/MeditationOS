"""Sentry error monitoring — provider-optional integration.

Initialises Sentry only when ``SENTRY_DSN`` is set.  With no DSN the module
imports cleanly and ``init_sentry()`` is a pure no-op, so the app behaves
exactly as it does today when unconfigured.

PII scrubbing policy (this app stores sensitive wellness data):
- ``send_default_pii=False``  — disables automatic PII collection globally.
- ``before_send`` drops the ``request.data`` body on every event so journal
  text, gratitude entries, mood logs, and biometric readings are never sent.
- Headers that may carry credentials (Authorization, Cookie, Set-Cookie,
  X-Auth-Token) are scrubbed from every event and transaction.
- A lightweight field-level scrubber removes common PII key names
  (email, password, token, …) wherever they appear in ``extra`` data.
- ``before_send_transaction`` applies the same body + header scrubbing.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Regex that matches key names we never want to send to Sentry.
_PII_KEY_RE = re.compile(
    r"password|token|secret|auth|cookie|email|journal|gratitude|mood|biometric|"
    r"heart_rate|hrv|note|text|content|body",
    re.IGNORECASE,
)

# Request headers that may carry credentials — scrub these completely.
_SENSITIVE_HEADERS = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-auth-token",
        "x-api-key",
        "proxy-authorization",
    }
)


def _scrub_headers(headers: dict[str, str] | None) -> dict[str, str] | None:
    """Replace sensitive header values with ``[Filtered]``."""
    if not headers:
        return headers
    return {
        k: "[Filtered]" if k.lower() in _SENSITIVE_HEADERS else v
        for k, v in headers.items()
    }


def _scrub_dict(d: dict[str, Any] | None) -> dict[str, Any] | None:
    """Recursively replace values whose keys match the PII pattern."""
    if not isinstance(d, dict):
        return d
    result = {}
    for k, v in d.items():
        if _PII_KEY_RE.search(str(k)):
            result[k] = "[Filtered]"
        elif isinstance(v, dict):
            result[k] = _scrub_dict(v)
        else:
            result[k] = v
    return result


def _scrub_event(event: dict[str, Any]) -> dict[str, Any]:
    """Strip request body and sensitive headers from a Sentry event payload."""
    request = event.get("request")
    if isinstance(request, dict):
        # Drop the entire body — it may contain journal text, biometrics, etc.
        request.pop("data", None)
        request["headers"] = _scrub_headers(request.get("headers"))
    # Scrub any extra context that may have been attached manually.
    if "extra" in event:
        event["extra"] = _scrub_dict(event["extra"])
    return event


def before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:  # noqa: ARG001
    """Sentry ``before_send`` hook — scrub PII before the event leaves the process."""
    return _scrub_event(event)


def before_send_transaction(
    event: dict[str, Any], hint: dict[str, Any]  # noqa: ARG001
) -> dict[str, Any] | None:
    """Sentry ``before_send_transaction`` hook — same scrubbing for performance traces."""
    return _scrub_event(event)


def init_sentry(dsn: str, environment: str, traces_sample_rate: float) -> None:
    """Initialise Sentry if *dsn* is non-empty; otherwise no-op."""
    if not dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logger.warning(
            "sentry-sdk is not installed; Sentry initialisation skipped. "
            "Add sentry-sdk[fastapi] to requirements.txt to enable monitoring."
        )
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        # Never collect PII automatically (user IDs, IPs, request bodies).
        send_default_pii=False,
        traces_sample_rate=traces_sample_rate,
        integrations=[
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
        ],
        before_send=before_send,
        before_send_transaction=before_send_transaction,
    )
    logger.info("Sentry initialised (environment=%s)", environment)

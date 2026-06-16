"""Sentry error monitoring — provider-optional integration.

Initialises Sentry only when ``SENTRY_DSN`` is set.  With no DSN the module
imports cleanly and ``init_sentry()`` is a pure no-op, so the app behaves
exactly as it does today when unconfigured.

PII scrubbing policy (this app stores sensitive wellness data):
- ``send_default_pii=False``  — disables automatic PII collection globally.
- ``before_send`` drops the ``request.data`` body on every event so journal
  text, gratitude entries, mood logs, and biometric readings are never sent.
- ``request.url`` and ``transaction`` have their query strings stripped so
  single-use secrets (``?token=…``, ``?code=…``) are never transmitted.
- ``request.query_string`` is cleared entirely.
- Headers that may carry credentials (Authorization, Cookie, Set-Cookie,
  X-Auth-Token) are scrubbed from every event and transaction.
- A lightweight field-level scrubber removes common PII key names
  (email, password, token, …) wherever they appear in ``extra`` and
  ``contexts`` data, including inside nested lists of dicts.
- ``before_send_transaction`` applies the same body + header + URL scrubbing.
- The FastAPI/Starlette integration uses ``transaction_style="endpoint"`` so
  transaction names are route patterns (e.g. ``/api/v1/users/{id}``) rather
  than raw URLs, minimising exposure even before ``_scrub_event`` runs.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

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


def _strip_query(url: str | None) -> str | None:
    """Return *url* with the query string and fragment removed.

    Keeps scheme, host, and path intact.  Returns the original value
    unchanged if parsing fails, rather than raising.
    """
    if not url:
        return url
    try:
        parts = urlsplit(url)
        # Replace query and fragment with empty strings.
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    except Exception:  # pragma: no cover – defensive only
        return url


def _scrub_headers(headers: dict[str, str] | None) -> dict[str, str] | None:
    """Replace sensitive header values with ``[Filtered]``."""
    if not headers:
        return headers
    return {
        k: "[Filtered]" if k.lower() in _SENSITIVE_HEADERS else v
        for k, v in headers.items()
    }


def _scrub_dict(d: Any) -> Any:
    """Recursively replace values whose keys match the PII pattern.

    Handles nested dicts and lists of dicts so PII is scrubbed regardless
    of nesting depth or whether the value is inside a list.
    """
    if isinstance(d, dict):
        result: dict[str, Any] = {}
        for k, v in d.items():
            if _PII_KEY_RE.search(str(k)):
                result[k] = "[Filtered]"
            else:
                result[k] = _scrub_dict(v)
        return result
    if isinstance(d, list):
        return [_scrub_dict(item) for item in d]
    return d


def _scrub_event(event: dict[str, Any]) -> dict[str, Any]:
    """Strip request body, query strings, and sensitive headers from a Sentry event."""
    request = event.get("request")
    if isinstance(request, dict):
        # Drop the entire body — it may contain journal text, biometrics, etc.
        request.pop("data", None)
        # Strip query strings from the URL — they may contain single-use tokens.
        request["url"] = _strip_query(request.get("url"))
        # Clear the query_string field entirely.
        request.pop("query_string", None)
        request["headers"] = _scrub_headers(request.get("headers"))

    # Strip any query string from the transaction name (raw-URL style names
    # may appear before the endpoint integration rewrites them).
    if "transaction" in event and isinstance(event["transaction"], str):
        event["transaction"] = _strip_query(event["transaction"])

    # Scrub any extra context that may have been attached manually.
    if "extra" in event:
        event["extra"] = _scrub_dict(event["extra"])

    # Scrub contexts too — they can carry device/runtime info with PII keys.
    if "contexts" in event:
        event["contexts"] = _scrub_dict(event["contexts"])

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
        # Disable local variable capture — frame locals can contain plaintext
        # passwords, JWT strings, or decrypted user content (journal/biometric)
        # and the before_send body scrubber does NOT walk exception frame locals.
        include_local_variables=False,
        # Defense-in-depth: never send request bodies even if before_send is
        # bypassed or misconfigured.  "never" is the strictest option.
        max_request_body_size="never",
        traces_sample_rate=traces_sample_rate,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        before_send=before_send,
        before_send_transaction=before_send_transaction,
    )
    logger.info("Sentry initialised (environment=%s)", environment)

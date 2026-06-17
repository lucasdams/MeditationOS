"""Structured logging + request-correlation for the API process.

Production logs are emitted as one JSON object per line to stdout (CloudWatch-
friendly — see `.claude/rules/infrastructure.md`). A per-request id is bound to a
`ContextVar`, injected onto every log record by a logging filter, and echoed on
the response header so a single request is traceable across the uvicorn access
log, app logs, and Sentry.

Locally (`ENVIRONMENT=development`) we keep human-readable text logs and skip the
JSON formatter, so `docker compose up` output stays readable.
"""

from __future__ import annotations

import json
import logging
import logging.config
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

# Header used to carry the correlation id in and out of the service.
REQUEST_ID_HEADER = "X-Request-ID"

# Holds the current request's correlation id. "-" when outside a request
# (startup/shutdown logs, background work) so the field is always present.
_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    """Return the correlation id bound to the current request (or "-")."""
    return _request_id_ctx.get()


# Standard LogRecord attributes — everything else on a record is treated as an
# "extra" and merged into the JSON output.
_RESERVED_RECORD_KEYS = frozenset(
    logging.makeLogRecord({}).__dict__.keys()
) | {"message", "asctime", "request_id", "taskName"}


class RequestIdFilter(logging.Filter):
    """Attach the current request id to every record so formatters can emit it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class JsonFormatter(logging.Formatter):
    """Render a log record as a single-line JSON object.

    Includes the correlation id and any structured ``extra=`` fields, so a
    rate-limit warning can carry ``client_ip``/``path`` as first-class keys.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # Merge any structured extras passed via logger.x(..., extra={...}).
        for key, value in record.__dict__.items():
            if key not in _RESERVED_RECORD_KEYS and key not in payload:
                payload[key] = value
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Configure the root + uvicorn loggers via ``dictConfig`` at app startup.

    JSON in every environment except ``development`` (human-readable text there).
    The request-id filter is attached so the correlation id appears in app logs
    and uvicorn access logs alike.
    """
    use_json = settings.environment != "development"
    formatter = "json" if use_json else "text"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                "request_id": {"()": "app.core.logging_config.RequestIdFilter"},
            },
            "formatters": {
                "json": {"()": "app.core.logging_config.JsonFormatter"},
                "text": {
                    "format": (
                        "%(asctime)s %(levelname)s [%(request_id)s] "
                        "%(name)s: %(message)s"
                    ),
                },
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": formatter,
                    "filters": ["request_id"],
                    "stream": "ext://sys.stdout",
                },
            },
            "root": {"handlers": ["default"], "level": "INFO"},
            "loggers": {
                # Route uvicorn through our handler so access/error logs are JSON
                # and carry the request id too. propagate=False avoids duplicates.
                "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},
                "uvicorn.error": {"handlers": ["default"], "level": "INFO", "propagate": False},
                "uvicorn.access": {"handlers": ["default"], "level": "INFO", "propagate": False},
            },
        }
    )


class RequestIdMiddleware:
    """Pure-ASGI middleware that binds a correlation id per request.

    Reuses an inbound ``X-Request-ID`` when present (so an upstream proxy/LB id
    flows through) or generates one. Binds it to the log ContextVar and Sentry,
    and echoes it on the response header. Implemented at the ASGI layer (not
    BaseHTTPMiddleware) so the ContextVar is set in the same task that runs the
    route and its log calls.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = self._inbound_id(scope) or uuid.uuid4().hex
        token = _request_id_ctx.set(request_id)
        self._tag_sentry(request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append(
                    (REQUEST_ID_HEADER.encode("latin-1"), request_id.encode("latin-1"))
                )
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            _request_id_ctx.reset(token)

    @staticmethod
    def _inbound_id(scope: Scope) -> str | None:
        target = REQUEST_ID_HEADER.lower().encode("latin-1")
        for name, value in scope.get("headers", []):
            if name == target:
                decoded = value.decode("latin-1").strip()
                if decoded:
                    return decoded
        return None

    @staticmethod
    def _tag_sentry(request_id: str) -> None:
        try:
            import sentry_sdk

            sentry_sdk.set_tag("request_id", request_id)
        except Exception:  # pragma: no cover — Sentry optional / not configured
            pass

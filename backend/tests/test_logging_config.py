"""Tests for structured logging, request-id correlation, and shutdown lifespan."""

import json
import logging

from fastapi.testclient import TestClient

from app.core.logging_config import (
    JsonFormatter,
    RequestIdFilter,
    get_request_id,
)


def test_json_formatter_emits_valid_json_with_request_id():
    record = logging.makeLogRecord(
        {"name": "test.logger", "levelno": logging.WARNING, "msg": "hello"}
    )
    record.levelname = "WARNING"
    RequestIdFilter().filter(record)
    payload = json.loads(JsonFormatter().format(record))
    assert payload["level"] == "WARNING"
    assert payload["logger"] == "test.logger"
    assert payload["message"] == "hello"
    assert payload["request_id"] == "-"  # no active request context


def test_json_formatter_includes_structured_extras():
    record = logging.makeLogRecord(
        {
            "name": "test.logger",
            "levelno": logging.WARNING,
            "msg": "rate limited",
            "client_ip": "1.2.3.4",
            "path": "/api/v1/auth/login",
        }
    )
    record.levelname = "WARNING"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["client_ip"] == "1.2.3.4"
    assert payload["path"] == "/api/v1/auth/login"


def test_request_id_bound_during_request(client):
    # The filter should see the request's id while a handler logs, and the same
    # value is echoed on the response header.
    res = client.get("/api/v1/health", headers={"X-Request-ID": "trace-xyz"})
    assert res.headers["X-Request-ID"] == "trace-xyz"
    # Outside any request the ContextVar resets to the default sentinel.
    assert get_request_id() == "-"


def test_lifespan_disposes_engine(monkeypatch):
    # Entering/exiting the app lifespan must dispose the engine pool on shutdown.
    import app.main as main_module

    disposed = {"called": False}
    monkeypatch.setattr(
        main_module.engine, "dispose", lambda: disposed.__setitem__("called", True)
    )
    with TestClient(main_module.app):
        pass  # startup → shutdown
    assert disposed["called"] is True

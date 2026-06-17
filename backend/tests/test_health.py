"""Tests for the liveness/readiness probes and request-id correlation."""

from app.core.logging_config import REQUEST_ID_HEADER


def test_health_ok_no_auth(client):
    # Liveness probe must answer without a session cookie.
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_readiness_ok_when_db_reachable(client):
    # Readiness runs SELECT 1 against the test DB and reports ready.
    res = client.get("/api/v1/health/ready")
    assert res.status_code == 200
    assert res.json() == {"status": "ready"}


def test_readiness_503_when_db_unavailable(client, monkeypatch):
    # When the DB session errors, readiness returns 503 (not 500) so an
    # orchestrator drains traffic instead of treating it as an app crash.
    import app.api.routes.health as health_module

    class _BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise RuntimeError("db down")

        def close(self):
            pass

    monkeypatch.setattr(health_module, "SessionLocal", lambda: _BrokenSession())

    res = client.get("/api/v1/health/ready")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable"}


def test_request_id_echoed_on_response(client):
    # No inbound id: the middleware generates one and echoes it.
    res = client.get("/api/v1/health")
    rid = res.headers.get(REQUEST_ID_HEADER)
    assert rid
    assert rid != "-"


def test_request_id_reused_from_inbound_header(client):
    # An inbound X-Request-ID (e.g. from an upstream proxy) flows through.
    res = client.get("/api/v1/health", headers={REQUEST_ID_HEADER: "abc-123"})
    assert res.headers.get(REQUEST_ID_HEADER) == "abc-123"

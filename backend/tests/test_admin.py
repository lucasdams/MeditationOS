"""Tests for the admin gating layer and GET /api/v1/admin/metrics.

Admins are designated via the ADMIN_EMAILS allowlist. Tests set it by monkeypatching
`settings.admin_emails` (the env value); `is_admin` is derived from it on the fly, so no
DB column or migration is involved.
"""

from datetime import UTC, datetime

import pytest

from app.core.config import settings


def _register(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})


def _login(client, email):
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _auth(client, email):
    _register(client, email)
    _login(client, email)


@pytest.fixture
def as_admin(monkeypatch):
    """Designate one email as admin for the duration of a test."""

    def _designate(email: str) -> None:
        monkeypatch.setattr(settings, "admin_emails", email)

    return _designate


# ── /auth/me reports is_admin correctly ────────────────────────────────────


def test_me_reports_non_admin(client):
    _auth(client, "normal@example.com")
    body = client.get("/api/v1/auth/me").json()
    assert body["is_admin"] is False


def test_me_reports_admin(client, as_admin):
    as_admin("boss@example.com")
    _auth(client, "boss@example.com")
    body = client.get("/api/v1/auth/me").json()
    assert body["is_admin"] is True


def test_admin_match_is_case_insensitive(client, as_admin):
    as_admin("Boss@Example.com")
    _auth(client, "boss@example.com")
    assert client.get("/api/v1/auth/me").json()["is_admin"] is True


# ── require_admin gating (default-deny) ────────────────────────────────────


def test_metrics_requires_auth(client):
    # No session at all → 401 (get_current_user fires before the admin check).
    assert client.get("/api/v1/admin/metrics").status_code == 401


def test_metrics_forbidden_for_non_admin(client):
    _auth(client, "normal@example.com")
    assert client.get("/api/v1/admin/metrics").status_code == 403


def test_metrics_allowed_for_admin(client, as_admin):
    as_admin("boss@example.com")
    _auth(client, "boss@example.com")
    assert client.get("/api/v1/admin/metrics").status_code == 200


def test_non_admin_cannot_reach_any_admin_route(client):
    # Every matched route on the admin router carries the router-level require_admin
    # dependency, so a logged-in non-admin is denied (403) on each — never served data.
    _auth(client, "normal@example.com")
    for method, path in [("get", "/api/v1/admin/metrics")]:
        assert getattr(client, method)(path).status_code == 403


# ── metrics aggregates are sane ────────────────────────────────────────────


def test_metrics_aggregates(client, as_admin):
    as_admin("boss@example.com")
    # A registered admin who practices, plus a separate guest.
    _auth(client, "boss@example.com")
    today = datetime.now(UTC).date()
    client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 600,
            "occurred_at": f"{today.isoformat()}T08:00:00",
        },
    )
    client.post("/api/v1/journals", json={"body": "calm", "mood": "calm"})
    client.post("/api/v1/gratitude", json={"category": "people", "text": "friends"})

    # A guest account (no email/password) — counts toward totals + guests.
    client.post("/api/v1/auth/guest")

    # Back to the admin to read metrics.
    _login(client, "boss@example.com")
    body = client.get("/api/v1/admin/metrics").json()

    assert body["users"]["total"] >= 2
    assert body["users"]["guests"] >= 1
    assert body["users"]["registered"] == body["users"]["total"] - body["users"]["guests"]
    # The admin registered via email/password (unverified) → unverified ≥ 1.
    assert body["users"]["email_unverified"] >= 1
    assert (
        body["users"]["email_verified"] + body["users"]["email_unverified"]
        == body["users"]["total"]
    )
    assert len(body["users"]["signups_last_30_days"]) == 30

    # The admin practiced today → counts as DAU and an active streak.
    assert body["active_users"]["dau"] >= 1
    assert body["active_users"]["mau"] >= body["active_users"]["dau"]
    assert body["users"]["with_active_streak"] >= 1

    assert body["practice"]["total_sessions"] >= 1
    assert body["practice"]["total_minutes"] >= 10
    assert body["content"]["journal_entries"] >= 1
    assert body["content"]["gratitude_entries"] >= 1


def test_metrics_payload_has_no_content_fields(client, as_admin):
    """Guard against accidental private-content leakage: the payload is numbers only."""
    as_admin("boss@example.com")
    _auth(client, "boss@example.com")
    client.post("/api/v1/journals", json={"body": "a private secret", "mood": "calm"})

    body = client.get("/api/v1/admin/metrics").json()

    # No journal/gratitude/mood body text anywhere in the serialized response.
    import json

    blob = json.dumps(body)
    assert "private secret" not in blob

    # Every leaf under the metric groups is an int (a count/sum), never a string body.
    for group in ("users", "active_users", "practice", "content", "adoption"):
        for key, value in body[group].items():
            if key == "signups_last_30_days":
                assert all(isinstance(d["count"], int) for d in value)
                continue
            assert isinstance(value, int), f"{group}.{key} should be a count, got {value!r}"

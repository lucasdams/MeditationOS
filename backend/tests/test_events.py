"""Tests for the product-analytics ingest route (POST /api/v1/events) and the
admin summary (GET /api/v1/admin/analytics/summary).

Covered:
- Event stored (202) for an anonymous caller with user_id NULL.
- Event stored AND attributed to the user when authenticated.
- Unknown event name → 422 (allowlist gate).
- Oversized / nested / non-scalar props → 422.
- Kill switch (ANALYTICS_ENABLED=False) → 204, nothing stored.
- Admin summary aggregates counts and is admin-only.
"""

from sqlalchemy import func, select

from app.core.config import settings
from app.models.analytics_event import AnalyticsEvent


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _verify_email(db_session, email: str) -> None:
    from sqlalchemy import text

    db_session.execute(
        text("UPDATE users SET email_verified = TRUE WHERE email = :email"),
        {"email": email},
    )
    db_session.commit()


# ── ingest ──────────────────────────────────────────────────────────────────


def test_anonymous_event_is_stored_with_null_user(client, db_session):
    # No auth cookie at all — the endpoint is auth-optional and must accept it.
    resp = client.post("/api/v1/events", json={"name": "guest_started"})
    assert resp.status_code == 202

    row = db_session.execute(select(AnalyticsEvent)).scalars().one()
    assert row.name == "guest_started"
    assert row.user_id is None  # anonymous → unattributed
    assert row.props == {}


def test_authenticated_event_is_attributed_to_user(client, db_session):
    _auth(client, "tracker@example.com")
    resp = client.post(
        "/api/v1/events",
        json={"name": "session_completed", "props": {"type": "mindfulness"}},
    )
    assert resp.status_code == 202

    row = db_session.execute(select(AnalyticsEvent)).scalars().one()
    assert row.name == "session_completed"
    assert row.props == {"type": "mindfulness"}
    assert row.user_id is not None  # attributed to the logged-in user


def test_unknown_event_name_rejected(client, db_session):
    resp = client.post("/api/v1/events", json={"name": "totally_made_up_event"})
    assert resp.status_code == 422  # allowlist gate
    count = db_session.execute(select(func.count()).select_from(AnalyticsEvent)).scalar_one()
    assert count == 0  # nothing stored


def test_extra_top_level_field_rejected(client):
    resp = client.post(
        "/api/v1/events",
        json={"name": "guest_started", "email": "sneaky@example.com"},
    )
    assert resp.status_code == 422  # extra="forbid"


def test_nested_props_rejected(client):
    resp = client.post(
        "/api/v1/events",
        json={"name": "session_completed", "props": {"nested": {"a": 1}}},
    )
    assert resp.status_code == 422  # scalar values only


def test_list_props_rejected(client):
    resp = client.post(
        "/api/v1/events",
        json={"name": "session_completed", "props": {"tags": [1, 2, 3]}},
    )
    assert resp.status_code == 422  # scalar values only


def test_too_many_prop_keys_rejected(client):
    props = {f"k{i}": i for i in range(21)}  # MAX_PROP_KEYS is 20
    resp = client.post(
        "/api/v1/events", json={"name": "session_completed", "props": props}
    )
    assert resp.status_code == 422


def test_oversized_props_rejected(client):
    # A single huge string blows the 2 KB byte cap (and the per-string length cap).
    resp = client.post(
        "/api/v1/events",
        json={"name": "session_completed", "props": {"blob": "x" * 5000}},
    )
    assert resp.status_code == 422


def test_kill_switch_stores_nothing(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "analytics_enabled", False)
    resp = client.post("/api/v1/events", json={"name": "guest_started"})
    assert resp.status_code == 204  # acknowledged, not stored
    count = db_session.execute(select(func.count()).select_from(AnalyticsEvent)).scalar_one()
    assert count == 0


# ── admin summary ───────────────────────────────────────────────────────────


def test_summary_requires_admin(client):
    # Unauthenticated → 401 (require_admin runs get_current_user first).
    assert client.get("/api/v1/admin/analytics/summary").status_code == 401


def test_summary_forbidden_for_non_admin(client):
    _auth(client, "nonadmin@example.com")
    assert client.get("/api/v1/admin/analytics/summary").status_code == 403


def test_summary_aggregates_counts(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "admin_emails", "boss@example.com")
    # Seed a few events (anonymous + attributed).
    client.post("/api/v1/events", json={"name": "guest_started"})
    client.post("/api/v1/events", json={"name": "guest_started"})
    _auth(client, "boss@example.com")
    _verify_email(db_session, "boss@example.com")
    client.post(
        "/api/v1/events",
        json={"name": "session_completed", "props": {"type": "mindfulness"}},
    )

    body = client.get("/api/v1/admin/analytics/summary?days=30").json()
    assert body["window_days"] == 30
    assert body["total_events"] == 3
    counts = {e["name"]: e["count"] for e in body["events_by_name"]}
    assert counts == {"guest_started": 2, "session_completed": 1}
    # Distinct active users/day present and zero-filled across the window.
    assert len(body["active_users_by_day"]) == 31  # days + 1 (inclusive span)
    assert sum(d["users"] for d in body["active_users_by_day"]) >= 1  # the admin was active

    # No per-user dumps / identifiers / props leak into the aggregate payload.
    import json

    blob = json.dumps(body)
    assert "boss@example.com" not in blob
    assert "mindfulness" not in blob  # props are never surfaced in the summary

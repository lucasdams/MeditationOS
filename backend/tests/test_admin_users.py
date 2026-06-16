"""Tests for admin user-management / support tooling + the audit trail.

Admins are designated via the ADMIN_EMAILS allowlist (monkeypatched), and need a
verified email — mirrors test_admin.py. These cover: gating (401/403/200), the
metadata-only (no private content) guarantee, the disable mechanism (a disabled user
can't authenticate; re-enable restores access), admin-initiated delete + cascade,
self-action guards (400), resend verification, and that every privileged action writes
an audit row read back through the admin-gated /admin/audit endpoint.
"""

import pytest
from sqlalchemy import text

from app.core.config import settings


def _register(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})


def _login(client, email):
    return client.post(
        "/api/v1/auth/login", json={"email": email, "password": "correct horse"}
    )


def _auth(client, email):
    _register(client, email)
    _login(client, email)


def _verify_email(db_session, email: str) -> None:
    db_session.execute(
        text("UPDATE users SET email_verified = TRUE WHERE email = :email"),
        {"email": email},
    )
    db_session.commit()


def _user_id(db_session, email: str) -> str:
    return str(
        db_session.execute(
            text("SELECT id FROM users WHERE email = :email"), {"email": email}
        ).scalar_one()
    )


@pytest.fixture
def as_admin(monkeypatch):
    def _designate(email: str) -> None:
        monkeypatch.setattr(settings, "admin_emails", email)

    return _designate


def _become_admin(client, db_session, as_admin, email="boss@example.com"):
    """Register + log in + verify an allowlisted admin; return their session client."""
    as_admin(email)
    _auth(client, email)
    _verify_email(db_session, email)
    # Re-login so the (now-verified) account's cookie is fresh for admin routes.
    _login(client, email)
    return email


# ── Gating: each new admin endpoint — unauth 401, non-admin 403, admin works ──

ENDPOINTS = [
    ("get", "/api/v1/admin/users"),
    ("get", "/api/v1/admin/audit"),
]


@pytest.mark.parametrize("method,path", ENDPOINTS)
def test_endpoint_requires_auth(client, method, path):
    assert getattr(client, method)(path).status_code == 401


@pytest.mark.parametrize("method,path", ENDPOINTS)
def test_endpoint_forbidden_for_non_admin(client, method, path):
    _auth(client, "normal@example.com")
    assert getattr(client, method)(path).status_code == 403


def test_users_and_audit_allowed_for_admin(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    assert client.get("/api/v1/admin/users").status_code == 200
    assert client.get("/api/v1/admin/audit").status_code == 200


def test_user_detail_gating(client, db_session, as_admin):
    # unauth → 401
    assert client.get("/api/v1/admin/users/whatever").status_code == 401
    # non-admin → 403
    _auth(client, "normal@example.com")
    assert client.get("/api/v1/admin/users/whatever").status_code == 403


# ── Search / list ──────────────────────────────────────────────────────────


def test_list_users_search_by_email(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    # A separate target user.
    _register(client, "needle@example.com")
    _login(client, "boss@example.com")

    body = client.get("/api/v1/admin/users", params={"q": "needle"}).json()
    assert body["total"] >= 1
    assert any(u["email"] == "needle@example.com" for u in body["users"])
    # Searching something absent returns an empty page (empty state).
    empty = client.get("/api/v1/admin/users", params={"q": "no-such-user-xyz"}).json()
    assert empty["total"] == 0 and empty["users"] == []


# ── Metadata-only guarantee (no private content) ───────────────────────────


def test_user_detail_has_no_private_content(client, db_session, as_admin):
    """A user who wrote a journal with known secret text: the admin detail response must
    NOT contain that text — same no-leak guarantee as the metrics test."""
    import json

    _become_admin(client, db_session, as_admin)
    # Target user writes a journal with a recognizable secret.
    _auth(client, "writer@example.com")
    client.post(
        "/api/v1/journals", json={"body": "a private secret xyzzy", "mood": "calm"}
    )
    target_id = _user_id(db_session, "writer@example.com")

    _login(client, "boss@example.com")
    resp = client.get(f"/api/v1/admin/users/{target_id}")
    assert resp.status_code == 200
    body = resp.json()
    blob = json.dumps(body)
    assert "private secret" not in blob
    assert "xyzzy" not in blob
    # Counts are present and journals == 1 (count only — never body text).
    assert body["counts"]["journals"] == 1


def test_user_detail_404_for_unknown(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    assert (
        client.get("/api/v1/admin/users/00000000-0000-0000-0000-000000000000").status_code
        == 404
    )


# ── Disable / re-enable ────────────────────────────────────────────────────


def test_disable_blocks_authentication_and_enable_restores(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    _register(client, "victim@example.com")
    target_id = _user_id(db_session, "victim@example.com")

    _login(client, "boss@example.com")
    r = client.post(f"/api/v1/admin/users/{target_id}/disable")
    assert r.status_code == 200
    assert r.json()["is_disabled"] is True

    # The disabled user can't log in (authenticate returns None → 401)…
    assert _login(client, "victim@example.com").status_code == 401

    # …and even a still-valid session is blocked at get_current_user (403). Simulate by
    # clearing the unique-token guard isn't needed: the login above failed, so use a
    # fresh disabled-account scenario where a cookie already exists.
    # Re-enable restores access.
    _login(client, "boss@example.com")
    r = client.post(f"/api/v1/admin/users/{target_id}/enable")
    assert r.status_code == 200 and r.json()["is_disabled"] is False
    assert _login(client, "victim@example.com").status_code == 200


def test_disabled_user_get_current_user_denied(client, db_session, as_admin):
    """get_current_user must 403 a disabled account even with a valid token."""
    _become_admin(client, db_session, as_admin)
    _auth(client, "tokenuser@example.com")
    # Confirm the live session works, capture the cookie.
    assert client.get("/api/v1/auth/me").status_code == 200
    cookie = client.cookies.get("access_token")
    target_id = _user_id(db_session, "tokenuser@example.com")

    _login(client, "boss@example.com")
    client.post(f"/api/v1/admin/users/{target_id}/disable")

    # Replay the victim's still-valid token directly → blocked at get_current_user (403).
    resp = client.get("/api/v1/auth/me", cookies={"access_token": cookie})
    assert resp.status_code == 403


# ── Self-action guards ─────────────────────────────────────────────────────


def test_admin_cannot_disable_self(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    me_id = _user_id(db_session, "boss@example.com")
    assert client.post(f"/api/v1/admin/users/{me_id}/disable").status_code == 400


def test_admin_cannot_delete_self(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    me_id = _user_id(db_session, "boss@example.com")
    assert client.delete(f"/api/v1/admin/users/{me_id}").status_code == 400


# ── Admin-initiated delete + cascade ───────────────────────────────────────


def test_admin_delete_removes_user_and_cascades(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    _auth(client, "doomed@example.com")
    client.post("/api/v1/journals", json={"body": "bye", "mood": "calm"})
    target_id = _user_id(db_session, "doomed@example.com")

    _login(client, "boss@example.com")
    assert client.delete(f"/api/v1/admin/users/{target_id}").status_code == 204

    # User row gone…
    gone = db_session.execute(
        text("SELECT count(*) FROM users WHERE id = :id"), {"id": target_id}
    ).scalar_one()
    assert gone == 0
    # …and their journals cascaded.
    journals = db_session.execute(
        text("SELECT count(*) FROM journals WHERE user_id = :id"), {"id": target_id}
    ).scalar_one()
    assert journals == 0


# ── Resend verification ────────────────────────────────────────────────────


def test_resend_verification(client, db_session, as_admin, monkeypatch):
    sent = {}

    def _fake_send(db, user):
        sent["email"] = user.email

    monkeypatch.setattr(
        "app.services.admin_users_service.user_service.send_verification_email",
        _fake_send,
    )

    _become_admin(client, db_session, as_admin)
    _register(client, "unverified@example.com")
    target_id = _user_id(db_session, "unverified@example.com")

    _login(client, "boss@example.com")
    r = client.post(f"/api/v1/admin/users/{target_id}/resend-verification")
    assert r.status_code == 202
    assert sent.get("email") == "unverified@example.com"


# ── Audit trail: a row per privileged action, read via the gated endpoint ──


def _audit_actions(client):
    return [e["action"] for e in client.get("/api/v1/admin/audit").json()["entries"]]


def test_audit_written_for_each_privileged_action(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    actor_id = _user_id(db_session, "boss@example.com")
    _register(client, "subject@example.com")
    target_id = _user_id(db_session, "subject@example.com")

    _login(client, "boss@example.com")
    client.post(f"/api/v1/admin/users/{target_id}/resend-verification")
    client.post(f"/api/v1/admin/users/{target_id}/disable")
    client.post(f"/api/v1/admin/users/{target_id}/enable")

    entries = client.get("/api/v1/admin/audit").json()["entries"]
    actions = [e["action"] for e in entries]
    assert "user.resend_verification" in actions
    assert "user.disable" in actions
    assert "user.enable" in actions

    # Each entry has the right actor/target.
    disable = next(e for e in entries if e["action"] == "user.disable")
    assert disable["actor_user_id"] == actor_id
    assert disable["target_user_id"] == target_id


def test_audit_written_for_delete_and_survives_target(client, db_session, as_admin):
    _become_admin(client, db_session, as_admin)
    _register(client, "willbe@example.com")
    target_id = _user_id(db_session, "willbe@example.com")

    _login(client, "boss@example.com")
    client.delete(f"/api/v1/admin/users/{target_id}")

    entries = client.get("/api/v1/admin/audit").json()["entries"]
    delete = next(e for e in entries if e["action"] == "user.delete")
    # The target FK is SET NULL on cascade, but the detail preserves who was deleted.
    assert delete["detail"]["deleted_user_id"] == target_id
    assert delete["target_user_id"] is None  # SET NULL after the cascade delete


def test_audit_endpoint_is_admin_gated(client):
    assert client.get("/api/v1/admin/audit").status_code == 401
    _auth(client, "normal@example.com")
    assert client.get("/api/v1/admin/audit").status_code == 403

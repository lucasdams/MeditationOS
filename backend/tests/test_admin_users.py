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


@pytest.mark.parametrize("bad_id", ["not-a-uuid", "123", "abc-def"])
def test_user_routes_404_for_malformed_id(client, db_session, as_admin, bad_id):
    """A malformed user_id maps to 404 — never an unhandled 500. The id is parsed in
    user_service.get_user_by_id, which returns None on a bad UUID → UserNotFoundError."""
    _become_admin(client, db_session, as_admin)
    base = f"/api/v1/admin/users/{bad_id}"
    assert client.get(base).status_code == 404
    assert client.post(f"{base}/disable").status_code == 404
    assert client.post(f"{base}/enable").status_code == 404
    assert client.post(f"{base}/resend-verification").status_code == 404
    assert client.delete(base).status_code == 404


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


# ── Atomicity: action + audit row commit together ──────────────────────────


def test_disable_rolls_back_if_audit_raises(db_session, as_admin, monkeypatch):
    """If record_audit raises after the flag is mutated, the disable must not persist.

    Uses raise_server_exceptions=False so the TestClient returns the 500 response
    instead of re-raising the server exception, letting us inspect the DB state.
    """
    from fastapi.testclient import TestClient

    from app.core.db import get_db
    from app.main import app as _app

    _app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(_app, raise_server_exceptions=False) as tolerant_client:
            as_admin("boss_atomd@example.com")
            tolerant_client.post(
                "/api/v1/auth/register",
                json={"email": "boss_atomd@example.com", "password": "correct horse"},
            )
            tolerant_client.post(
                "/api/v1/auth/login",
                json={"email": "boss_atomd@example.com", "password": "correct horse"},
            )
            db_session.execute(
                text("UPDATE users SET email_verified = TRUE WHERE email = :e"),
                {"e": "boss_atomd@example.com"},
            )
            db_session.commit()
            tolerant_client.post(
                "/api/v1/auth/login",
                json={"email": "boss_atomd@example.com", "password": "correct horse"},
            )

            tolerant_client.post(
                "/api/v1/auth/register",
                json={"email": "atomic_disable@example.com", "password": "correct horse"},
            )
            target_id = _user_id(db_session, "atomic_disable@example.com")

            # Monkeypatch record_audit to raise, simulating an audit-insert failure.
            import app.services.audit_service as _audit_mod

            def _failing_record_audit(*args, **kwargs):
                raise RuntimeError("simulated audit failure")

            monkeypatch.setattr(_audit_mod, "record_audit", _failing_record_audit)

            r = tolerant_client.post(f"/api/v1/admin/users/{target_id}/disable")
            assert r.status_code == 500

            # Verify the flag rolled back: query the DB directly (no API call needed).
            is_disabled = db_session.execute(
                text("SELECT is_disabled FROM users WHERE id = :id"), {"id": target_id}
            ).scalar_one()
            assert is_disabled is False
    finally:
        _app.dependency_overrides.clear()


def test_delete_rolls_back_if_audit_raises(db_session, as_admin, monkeypatch):
    """If record_audit raises before the delete, the user must still exist.

    Uses raise_server_exceptions=False so the TestClient returns the 500 response.
    """
    from fastapi.testclient import TestClient

    from app.core.db import get_db
    from app.main import app as _app

    _app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(_app, raise_server_exceptions=False) as tolerant_client:
            as_admin("boss_atomdel@example.com")
            tolerant_client.post(
                "/api/v1/auth/register",
                json={"email": "boss_atomdel@example.com", "password": "correct horse"},
            )
            tolerant_client.post(
                "/api/v1/auth/login",
                json={"email": "boss_atomdel@example.com", "password": "correct horse"},
            )
            db_session.execute(
                text("UPDATE users SET email_verified = TRUE WHERE email = :e"),
                {"e": "boss_atomdel@example.com"},
            )
            db_session.commit()
            tolerant_client.post(
                "/api/v1/auth/login",
                json={"email": "boss_atomdel@example.com", "password": "correct horse"},
            )

            tolerant_client.post(
                "/api/v1/auth/register",
                json={"email": "atomic_delete@example.com", "password": "correct horse"},
            )
            target_id = _user_id(db_session, "atomic_delete@example.com")

            import app.services.audit_service as _audit_mod

            def _failing_record_audit(*args, **kwargs):
                raise RuntimeError("simulated audit failure")

            monkeypatch.setattr(_audit_mod, "record_audit", _failing_record_audit)

            r = tolerant_client.delete(f"/api/v1/admin/users/{target_id}")
            assert r.status_code == 500

            # The user must still exist — the delete rolled back with the audit failure.
            monkeypatch.undo()
            count = db_session.execute(
                text("SELECT count(*) FROM users WHERE id = :id"), {"id": target_id}
            ).scalar_one()
            assert count == 1
    finally:
        _app.dependency_overrides.clear()


# ── Search LIKE wildcard escaping ──────────────────────────────────────────


def test_search_literal_percent_does_not_match_all(client, db_session, as_admin):
    """A query of '%' must match only users whose email/username contains a literal '%';
    it must NOT return all users (regression: unescaped wildcard → full-table match)."""
    _become_admin(client, db_session, as_admin)
    # Register a normal user that does NOT contain a literal '%'.
    _register(client, "nopercent@example.com")
    _login(client, "boss@example.com")

    body = client.get("/api/v1/admin/users", params={"q": "%"}).json()
    # The wildcard-percent should match nobody (no email contains a literal '%').
    assert all("%" in u["email"] for u in body["users"]), (
        "search for '%' must only return rows whose email contains a literal '%'"
    )
    assert body["total"] == 0 or all("%" in u["email"] for u in body["users"])


def test_search_literal_underscore_does_not_over_match(client, db_session, as_admin):
    """A query of '_' must not match single-char substrings (regex-wildcard behaviour)."""
    _become_admin(client, db_session, as_admin)
    _register(client, "nounderscore@example.com")
    _login(client, "boss@example.com")

    body = client.get("/api/v1/admin/users", params={"q": "_"}).json()
    # All returned rows must actually contain a literal '_' in email or username.
    for u in body["users"]:
        assert "_" in (u["email"] or "") or "_" in (u.get("username") or ""), (
            f"user {u['email']} does not contain a literal underscore but was matched"
        )

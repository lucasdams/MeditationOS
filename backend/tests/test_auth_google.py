"""Tests for POST /api/v1/auth/google (Sign in with Google).

The Google token verification is patched — we never call Google in tests; we
exercise the account create / link / reuse logic and error handling.
"""

from unittest.mock import patch

from sqlalchemy import text

GOOGLE_VERIFY = "app.services.user_service.verify_id_token"


def _claims(email, sub, verified=True):
    return {"sub": sub, "email": email, "email_verified": verified}


def test_google_creates_new_user(client):
    with patch(GOOGLE_VERIFY, return_value=_claims("new@example.com", "google-1")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200
    assert res.json()["email"] == "new@example.com"
    assert res.json()["username"] is None
    # The session cookie is set, so /me now works.
    assert client.get("/api/v1/auth/me").json()["email"] == "new@example.com"


def test_google_same_sub_reuses_account(client):
    with patch(GOOGLE_VERIFY, return_value=_claims("repeat@example.com", "google-2")):
        first = client.post("/api/v1/auth/google", json={"credential": "tok"}).json()
        second = client.post("/api/v1/auth/google", json={"credential": "tok"}).json()
    assert first["id"] == second["id"]  # no duplicate account


def test_google_links_existing_password_account(client):
    # Register with email + password first.
    client.post(
        "/api/v1/auth/register",
        json={"email": "linkme@example.com", "password": "correct horse"},
    )
    with patch(GOOGLE_VERIFY, return_value=_claims("linkme@example.com", "google-3")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200
    # Same email → linked, and password login still works afterwards.
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "linkme@example.com", "password": "correct horse"},
    )
    assert login.status_code == 200


def test_google_invalid_token_is_401(client):
    with patch(GOOGLE_VERIFY, side_effect=ValueError("bad token")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 401


def test_google_unverified_email_is_401(client):
    claims = _claims("nope@example.com", "google-4", verified=False)
    with patch(GOOGLE_VERIFY, return_value=claims):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 401


def test_google_requires_credential(client):
    assert client.post("/api/v1/auth/google", json={}).status_code == 422


# ── Disabled-account guard ─────────────────────────────────────────────────


def _disable_user(db_session, email: str) -> None:
    """Directly disable a user in the test DB (mirrors admin_users_service)."""
    db_session.execute(
        text("UPDATE users SET is_disabled = TRUE WHERE email = :email"),
        {"email": email},
    )
    db_session.commit()


def test_google_disabled_via_google_sub_is_rejected(client, db_session):
    """Branch 1: an account already linked by google_sub that is disabled must not
    authenticate — /auth/google must return 401/403."""
    # First login creates + links the account.
    with patch(GOOGLE_VERIFY, return_value=_claims("disabled-sub@example.com", "g-dis-1")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200, "Initial login should succeed"

    _disable_user(db_session, "disabled-sub@example.com")

    # Second login with the same google_sub must be blocked.
    with patch(GOOGLE_VERIFY, return_value=_claims("disabled-sub@example.com", "g-dis-1")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code in (401, 403), (
        f"Expected 401 or 403 for a disabled account (google_sub branch), got {res.status_code}"
    )


def test_google_disabled_via_email_link_is_rejected(client, db_session):
    """Branch 2: an existing password account that is disabled, linked by email match,
    must not authenticate via /auth/google."""
    # Register a password account first — no google_sub yet.
    client.post(
        "/api/v1/auth/register",
        json={"email": "disabled-email@example.com", "password": "correct horse"},
    )
    _disable_user(db_session, "disabled-email@example.com")

    # Google login resolves by email (no google_sub) → hits the disabled check.
    with patch(GOOGLE_VERIFY, return_value=_claims("disabled-email@example.com", "g-dis-2")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code in (401, 403), (
        f"Expected 401 or 403 for a disabled account (email-link branch), got {res.status_code}"
    )


# ── First-time-login unique-race recovery ──────────────────────────────────


def _arm_commit_to_raise_once(db_session):
    """Make the next session commit raise IntegrityError once (a concurrent first-time
    Google login won the unique google_sub/email race), then restore the real commit so the
    service's rollback + re-resolve can complete."""
    from sqlalchemy.exc import IntegrityError

    real_commit = db_session.commit
    state = {"armed": True}

    def fake_commit(*args, **kwargs):
        if state["armed"]:
            state["armed"] = False
            raise IntegrityError("INSERT users", {}, Exception("uq google_sub"))
        return real_commit(*args, **kwargs)

    db_session.commit = fake_commit  # restored implicitly by per-test rollback/teardown


def test_google_create_race_recovers_to_existing_account(client, db_session):
    """Branch 3 (create): a near-simultaneous first-time login created the account first.
    The create commit hits the unique google_sub constraint → the service rolls back and
    re-resolves to the existing account, returning 200 (not 500)."""
    from app.models.user import User

    # Simulate the row the racing request already committed.
    db_session.add(
        User(email="race-new@example.com", google_sub="g-race-1", email_verified=True)
    )
    db_session.commit()
    winner_id = str(
        db_session.execute(
            select(User.id).where(User.google_sub == "g-race-1")
        ).scalar_one()
    )

    _arm_commit_to_raise_once(db_session)
    with patch(GOOGLE_VERIFY, return_value=_claims("race-new@example.com", "g-race-1")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200, "Create race must recover, not 500"
    assert res.json()["id"] == winner_id  # resolved to the account that won the race


def test_google_link_race_recovers_to_existing_account(client, db_session):
    """Branch 2 (link): an existing password account is being linked, but a concurrent login
    linked/created the google_sub first. The link commit collides → roll back and re-resolve
    by google_sub, returning 200 (not 500)."""
    from app.models.user import User

    # A password account with this email, plus a separate row already holding the google_sub
    # (what the racing request committed first).
    client.post(
        "/api/v1/auth/register",
        json={"email": "race-link@example.com", "password": "correct horse"},
    )
    db_session.add(
        User(email="winner-link@example.com", google_sub="g-race-2", email_verified=True)
    )
    db_session.commit()
    winner_id = str(
        db_session.execute(
            select(User.id).where(User.google_sub == "g-race-2")
        ).scalar_one()
    )

    _arm_commit_to_raise_once(db_session)
    with patch(GOOGLE_VERIFY, return_value=_claims("race-link@example.com", "g-race-2")):
        res = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert res.status_code == 200, "Link race must recover, not 500"
    assert res.json()["id"] == winner_id  # resolved by google_sub to the racing account

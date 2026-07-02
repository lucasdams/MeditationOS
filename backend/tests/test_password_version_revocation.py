"""Session revocation via the access-token `pwv` (password-version) claim.

An access token is bound to the user's current password version. Changing the
password — through settings change-password OR the forgot-password reset flow, both
of which rewrite `password_hash` — rotates that version and invalidates every
outstanding access-token cookie for the user. The acting session in the settings
change-password (and guest claim) flow is re-issued a fresh cookie so it survives,
while all OTHER sessions die. The claim is now REQUIRED: a token minted without it
(a pre-`pwv` legacy cookie) is rejected rather than grandfathered, so an old
long-lived cookie can't outlive a password change.
"""

import jwt

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    create_access_token,
    decode_access_token,
    password_fingerprint,
)
from app.models.user import User
from app.services import user_service
from app.services.notifications import email

CREDS = {"email": "pwv@example.com", "password": "correct horse"}


def _register(client, creds=CREDS):
    res = client.post("/api/v1/auth/register", json=creds)
    assert res.status_code == 201
    return res.json()["id"]


def _current_hash(db_session, user_id) -> str:
    """The user's password_hash straight from the DB (tests share the session)."""
    user = user_service.get_user_by_id(db_session, user_id)
    return user.password_hash


# --- unit: fingerprint --------------------------------------------------------


def test_fingerprint_changes_when_password_changes():
    from app.core.security import hash_password

    a = password_fingerprint(hash_password("first"))
    b = password_fingerprint(hash_password("second"))
    assert a != b


def test_fingerprint_passwordless_is_stable_sentinel():
    # Guests / Google-only accounts have no hash — a fixed value keeps them working,
    # distinct from any real fingerprint so setting a password later rotates it.
    assert password_fingerprint(None) == password_fingerprint(None)
    from app.core.security import hash_password

    assert password_fingerprint(None) != password_fingerprint(hash_password("pw"))


# --- fresh token authenticates ------------------------------------------------


def test_fresh_access_token_authenticates(client, db_session):
    user_id = _register(client)
    token = create_access_token(
        user_id, pwv=password_fingerprint(_current_hash(db_session, user_id))
    )
    client.cookies.set("access_token", token)
    assert client.get("/api/v1/auth/me").status_code == 200


# --- password change revokes pre-change tokens --------------------------------


def test_token_minted_before_password_change_is_rejected(client, db_session):
    user_id = _register(client)
    old_hash = _current_hash(db_session, user_id)
    stale_token = create_access_token(user_id, pwv=password_fingerprint(old_hash))

    # Change the password (this is a different "session": the client's own login cookie).
    client.post("/api/v1/auth/login", json=CREDS)
    res = client.post(
        "/api/v1/auth/password",
        json={"current_password": CREDS["password"], "new_password": "a new secret"},
    )
    assert res.status_code == 200

    # The token minted BEFORE the change no longer authenticates — session revoked.
    client.cookies.clear()
    client.cookies.set("access_token", stale_token)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_token_minted_after_password_change_works(client, db_session):
    user_id = _register(client)
    client.post("/api/v1/auth/login", json=CREDS)
    client.post(
        "/api/v1/auth/password",
        json={"current_password": CREDS["password"], "new_password": "a new secret"},
    )
    new_hash = _current_hash(db_session, user_id)
    fresh_token = create_access_token(user_id, pwv=password_fingerprint(new_hash))

    client.cookies.clear()
    client.cookies.set("access_token", fresh_token)
    assert client.get("/api/v1/auth/me").status_code == 200


# --- the acting session survives its own settings change-password -------------


def test_self_change_password_keeps_acting_session(client):
    """The user who changes their own password stays signed in: the endpoint re-issues
    their cookie with the new pwv (only OTHER sessions are logged out)."""
    _register(client)
    client.post("/api/v1/auth/login", json=CREDS)
    res = client.post(
        "/api/v1/auth/password",
        json={"current_password": CREDS["password"], "new_password": "a new secret"},
    )
    assert res.status_code == 200
    # Same client/cookie jar — the re-issued cookie authenticates the very next call.
    assert client.get("/api/v1/auth/me").status_code == 200


def test_self_change_password_revokes_a_second_session(client, db_session):
    """Concretely: one device changes the password; a second device's cookie dies."""
    user_id = _register(client)
    # A second device's token, captured before the change.
    other_device = create_access_token(
        user_id, pwv=password_fingerprint(_current_hash(db_session, user_id))
    )

    client.post("/api/v1/auth/login", json=CREDS)  # "this device"
    client.post(
        "/api/v1/auth/password",
        json={"current_password": CREDS["password"], "new_password": "a new secret"},
    )
    # This device still works (re-issued cookie already in the jar).
    assert client.get("/api/v1/auth/me").status_code == 200
    # The other device is logged out.
    client.cookies.clear()
    client.cookies.set("access_token", other_device)
    assert client.get("/api/v1/auth/me").status_code == 401


# --- reset-password flow invalidates old tokens -------------------------------


def _reset_token(client, monkeypatch, email_addr):
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email, "send_email", lambda to, s, b: sent.append((to, s, b)) or True
    )
    client.post("/api/v1/auth/password/reset-request", json={"email": email_addr})
    return sent[0][2].split("token=", 1)[1].split()[0].strip()


def test_reset_password_invalidates_old_access_token(client, db_session, monkeypatch):
    user_id = _register(client)
    stale_token = create_access_token(
        user_id, pwv=password_fingerprint(_current_hash(db_session, user_id))
    )

    token = _reset_token(client, monkeypatch, CREDS["email"])
    res = client.post(
        "/api/v1/auth/password/reset",
        json={"token": token, "new_password": "a reset secret"},
    )
    assert res.status_code == 204

    client.cookies.clear()
    client.cookies.set("access_token", stale_token)
    assert client.get("/api/v1/auth/me").status_code == 401


# --- legacy tokens (no pwv claim) are now REJECTED (grandfathering removed) ----


def test_legacy_token_without_pwv_is_rejected(client, db_session):
    """A pre-`pwv` access token (claim absent) still decodes structurally, but is
    rejected at the auth layer: we now REQUIRE the claim so an old long-lived cookie
    can't linger past a password change."""
    user_id = _register(client)
    legacy = create_access_token(user_id)  # pwv defaults to None → claim omitted
    assert "pwv" not in jwt.decode(legacy, settings.secret_key, algorithms=[ALGORITHM])
    assert decode_access_token(legacy) == user_id  # structurally valid…

    client.cookies.set("access_token", legacy)
    assert client.get("/api/v1/auth/me").status_code == 401  # …but rejected: pwv required


def test_legacy_token_rejected_without_a_password_change(client, db_session):
    """Rejection is by ABSENCE of the claim — it doesn't depend on any password change."""
    user_id = _register(client)
    legacy = create_access_token(user_id)
    client.cookies.clear()
    client.cookies.set("access_token", legacy)
    assert client.get("/api/v1/auth/me").status_code == 401


# --- guests keep working ------------------------------------------------------


def test_guest_session_still_works(client):
    res = client.post("/api/v1/auth/guest")
    assert res.status_code == 200
    # The guest's cookie (issued with the passwordless sentinel pwv) authenticates.
    assert client.get("/api/v1/auth/me").json()["is_guest"] is True


def test_guest_claim_keeps_acting_session(client):
    """Claiming sets a real password (pwv rotates from the sentinel); the acting guest
    stays signed in because the claim endpoint re-issues their cookie."""
    client.post("/api/v1/auth/guest")
    res = client.post(
        "/api/v1/auth/claim",
        json={"email": "claimed-pwv@example.com", "password": "a real secret"},
    )
    assert res.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200


def test_google_only_first_password_keeps_acting_session(client, db_session):
    """A Google-only account setting its first password rotates pwv from the sentinel;
    the change-password endpoint re-issues the cookie so the actor isn't logged out."""
    user = User(email="goog-pwv@example.com", google_sub="g-pwv", password_hash=None)
    db_session.add(user)
    db_session.commit()
    client.cookies.set(
        "access_token",
        create_access_token(str(user.id), pwv=password_fingerprint(None)),
    )
    res = client.post("/api/v1/auth/password", json={"new_password": "brand new pw"})
    assert res.status_code == 200
    # Re-issued cookie keeps the actor signed in.
    assert client.get("/api/v1/auth/me").status_code == 200

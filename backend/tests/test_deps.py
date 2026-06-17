"""Tests for shared route dependencies (app/api/deps.py).

Focus: `today_for_user`, the single shared helper extracted from the per-module
`_today_for` copies. It must resolve the user's local date + IANA timezone and fall
back to UTC for a missing or unknown zone — behaviour identical to the old copies.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import update

from app.api.deps import today_for_user
from app.models.user import User


def _user(tz):
    return User(email="tz@example.com", password_hash="x", timezone=tz)


def test_today_for_user_uses_user_timezone():
    today, tz = today_for_user(_user("Asia/Tokyo"))
    assert tz == "Asia/Tokyo"
    # The returned date matches "now" computed in that zone.
    assert today == datetime.now(ZoneInfo("Asia/Tokyo")).date()


def test_today_for_user_defaults_to_utc_when_unset():
    today, tz = today_for_user(_user(None))
    assert tz == "UTC"
    assert today == datetime.now(ZoneInfo("UTC")).date()


def test_today_for_user_falls_back_to_utc_for_unknown_zone():
    # An unparseable/unknown IANA name must not raise — it degrades to UTC.
    today, tz = today_for_user(_user("Not/AZone"))
    assert tz == "UTC"
    assert today == datetime.now(ZoneInfo("UTC")).date()


# --- The disabled-account gate (centralized in get_current_user) ---------------------


def test_disabled_account_blocked_on_protected_routes(client, db_session):
    """A still-valid session token is refused once the account is disabled.

    The gate lives in `get_current_user`, the single choke point every protected route
    depends on. We log in (valid cookie), then flip `is_disabled` directly in the DB —
    no admin endpoint involved — and confirm a normal data route (dashboard/stats) is
    blocked. Documents the currently-correct centralized behaviour so a regression that
    drops the check from `deps.py` is caught here.
    """
    creds = {"email": "disabled_gate@example.com", "password": "correct horse"}
    client.post("/api/v1/auth/register", json=creds)
    client.post("/api/v1/auth/login", json=creds)
    # The token is valid right now.
    assert client.get("/api/v1/dashboard/stats").status_code == 200

    db_session.execute(
        update(User).where(User.email == creds["email"]).values(is_disabled=True)
    )
    db_session.commit()

    # Same valid token, now-disabled account → blocked at the central gate (403).
    resp = client.get("/api/v1/dashboard/stats")
    assert resp.status_code in (401, 403)
    assert resp.status_code == 403  # the current centralized behaviour
    assert "detail" in resp.json()

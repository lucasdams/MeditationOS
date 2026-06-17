"""Tests for shared route dependencies (app/api/deps.py).

Focus: `today_for_user`, the single shared helper extracted from the per-module
`_today_for` copies. It must resolve the user's local date + IANA timezone and fall
back to UTC for a missing or unknown zone — behaviour identical to the old copies.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

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

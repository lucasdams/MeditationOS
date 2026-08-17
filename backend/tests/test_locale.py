"""Per-user UI locale: the /auth/locale endpoint and locale-aware transactional emails.

The client localizes its own UI, but server-sent copy (emails, push) has no client in the
loop — it's localized from the stored `user.locale`. English is the source of truth and the
fallback, so an unknown locale never produces a blank message.
"""

from app.models.user import User
from app.services import reminder_service, user_service, weekly_review_service


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


# --- endpoint ---------------------------------------------------------------


def test_default_locale_is_en(client):
    _auth(client, "loc_default@example.com")
    assert client.get("/api/v1/auth/me").json()["locale"] == "en"


def test_set_locale_ja(client):
    _auth(client, "loc_ja@example.com")
    res = client.post("/api/v1/auth/locale", json={"locale": "ja"})
    assert res.status_code == 200
    assert res.json()["locale"] == "ja"
    assert client.get("/api/v1/auth/me").json()["locale"] == "ja"


def test_unknown_locale_falls_back_to_en(client):
    _auth(client, "loc_bad@example.com")
    res = client.post("/api/v1/auth/locale", json={"locale": "fr"})
    assert res.status_code == 200
    # Unknown locales are a soft fallback, not an error — we store "en".
    assert res.json()["locale"] == "en"


def test_locale_requires_auth(client):
    assert client.post("/api/v1/auth/locale", json={"locale": "ja"}).status_code == 401


# --- email localization -----------------------------------------------------


def _user(locale: str) -> User:
    return User(email="x@example.com", username="Aiko", locale=locale)


def test_reminder_email_english_by_default():
    body = reminder_service._reminder_body(_user("en"))
    assert "gentle invitation" in body
    # No stray Japanese in the English body.
    assert "瞑想" not in body


def test_reminder_email_japanese_when_locale_ja():
    body = reminder_service._reminder_body(_user("ja"))
    assert "静かな数分" in body
    assert "設定からいつでもオフにできます" in body


def test_streak_save_email_japanese_when_locale_ja():
    body = reminder_service._streak_save_body(_user("ja"), 5)
    assert "5日間の連続記録" in body


def test_verification_email_japanese_when_locale_ja():
    body = user_service._verification_email_body(_user("ja"), "https://example.test/verify")
    assert "MeditationOSへようこそ" in body
    assert "https://example.test/verify" in body


def test_reset_email_japanese_when_locale_ja():
    body = user_service._reset_email_body(_user("ja"), "https://example.test/reset")
    assert "パスワードをリセット" in body


def test_japanese_greeting_has_no_dangling_san_when_nameless():
    # A fresh account has no username; the JA greeting must not render the ungrammatical
    # "こんにちはさん" — it falls back to a plain こんにちは、.
    nameless = User(email="x@example.com", username=None, locale="ja")
    body = user_service._verification_email_body(nameless, "https://example.test/verify")
    assert "こんにちはさん" not in body
    assert body.startswith("こんにちは、")
    # With a name, さん is appended as normal.
    named = user_service._verification_email_body(_user("ja"), "https://example.test/verify")
    assert named.startswith("Aikoさん、")


def test_weekly_summary_mood_localized_to_ja():
    # top_mood is stored as an English key; the JA body names it in Japanese.
    from datetime import date

    from app.schemas.weekly_review import WeeklyReview

    review = WeeklyReview(
        start=date(2026, 8, 10),
        end=date(2026, 8, 16),
        minutes=40,
        last_week_minutes=30,
        sessions=4,
        active_days=4,
        current_streak_days=4,
        longest_session_seconds=900,
        top_mood="calm",
        mood_counts={"calm": 3},
    )
    body = weekly_review_service._summary_body(_user("ja"), review)
    assert "おだやか" in body
    assert "先週より10分多い" in body

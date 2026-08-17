"""Localization for server-sent copy — transactional emails and push notifications.

The client can localize its own UI, but content the *server* sends (reminder emails, the
weekly summary, verification/reset links, push titles) has no client in the loop, so we
localize it here from the recipient's stored ``user.locale``.

English is the source of truth and the fallback: any locale we don't translate falls back
to the English string, so a new locale is never a blank email — just an untranslated one.
"""

from app.models.user import User

# UI languages we localize server-sent copy for. Anything else falls back to English.
SUPPORTED = frozenset({"en", "ja"})


def locale_of(user: User) -> str:
    """The recipient's locale, normalized to one we actually translate ("en" | "ja")."""
    loc = getattr(user, "locale", "en") or "en"
    return loc if loc in SUPPORTED else "en"


def pick(user: User, *, en: str, ja: str) -> str:
    """Choose the copy matching the user's locale, defaulting to English."""
    return ja if locale_of(user) == "ja" else en


def greeting_ja(user: User) -> str:
    """The Japanese email opening. Appends さん only when there's a name — a nameless
    user (e.g. a fresh account's first verification email) gets a plain こんにちは rather
    than the ungrammatical "こんにちはさん"."""
    return f"{user.username}さん、" if user.username else "こんにちは、"


def streak_label_ja(days: int) -> str:
    """Japanese label for a streak length. A single day reads 1日 (1日間 is unnatural
    for a one-day span); every other length is N日間."""
    return "1日" if days == 1 else f"{days}日間"

"""Domain exceptions raised by services and mapped to HTTP status in routes.

Keeping these separate from HTTP keeps the service layer transport-agnostic
(see docs/decisions/0006-layered-architecture.md).
"""


class EmailAlreadyExistsError(Exception):
    """Raised when registering an email that already has an account."""


class UsernameTakenError(Exception):
    """Raised when setting a username that another account already uses."""


class GoogleAuthError(Exception):
    """Raised when a Google ID token is invalid, expired, or its email is unverified."""


class InvalidTimezoneError(Exception):
    """Raised when setting a timezone that isn't a valid IANA zone."""


class InvalidQuestFeaturesError(Exception):
    """Raised when quest-feature selection is unknown or fewer than the minimum (3)."""


class InvalidPasswordError(Exception):
    """Raised when a password change supplies a wrong/missing current password."""


class InvalidResetTokenError(Exception):
    """Raised when a password-reset token is invalid, expired, or already used."""


class InvalidVerificationTokenError(Exception):
    """Raised when an email-verification token is invalid or expired."""


class LinkedSessionNotFoundError(Exception):
    """Raised when a journal links a session that isn't the caller's (or doesn't exist)."""


class NotAGuestError(Exception):
    """Raised when a non-guest account tries to be claimed."""


class DailyLimitError(Exception):
    """Raised when a user hits the per-day creation cap for a resource (anti-spam)."""


# User-facing detail returned (as HTTP 429) when a DailyLimitError reaches the API
# boundary. Mapped once, app-wide, by the handler in `app/main.py`.
DAILY_LIMIT_DETAIL = "Daily limit reached. Please try again tomorrow."


class GoalNotCheckableError(Exception):
    """Raised when checking in on a non-custom goal — built-in activities derive
    their progress and can't be manually marked done."""


class UserNotFoundError(Exception):
    """Raised when an admin support action targets a user id that doesn't exist."""


class AdminSelfActionError(Exception):
    """Raised when an admin tries to disable or delete their OWN account via the
    admin support endpoints — a lockout foot-gun; use account self-service instead."""

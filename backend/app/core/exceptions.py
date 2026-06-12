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

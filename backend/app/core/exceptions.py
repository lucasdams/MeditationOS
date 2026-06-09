"""Domain exceptions raised by services and mapped to HTTP status in routes.

Keeping these separate from HTTP keeps the service layer transport-agnostic
(see docs/decisions/0006-layered-architecture.md).
"""


class EmailAlreadyExistsError(Exception):
    """Raised when registering an email that already has an account."""

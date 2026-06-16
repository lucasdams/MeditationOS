"""Small shared helpers for the route layer (HTTP-specific, transport concerns).

Domain errors live in `app/core/exceptions.py`; these helpers build the
`HTTPException` responses that routes raise, so the same status/detail shape is
written once instead of inline in every handler.
"""

from fastapi import HTTPException, status


def not_found(detail: str = "Not found") -> HTTPException:
    """A 404 with the given user-facing detail (defaults to a generic 'Not found')."""
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

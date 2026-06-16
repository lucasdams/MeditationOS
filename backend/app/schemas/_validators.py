"""Reusable Pydantic validators shared across request schemas."""


def _capped_blank_to_none(max_length: int):
    """A BeforeValidator that trims whitespace, maps empty/whitespace-only → None, and
    rejects over-length input as a 422.

    Doing the cap here (rather than via Field(max_length=...)) lets the field stay
    `str | None`: the constraint applies only when a real string is present, so an explicit
    `null` (used to clear the value) passes straight through instead of tripping a length
    validator that can't handle None.
    """

    def _validate(value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                return None
            if len(trimmed) > max_length:
                raise ValueError(f"must be at most {max_length} characters")
            return trimmed
        return value

    return _validate

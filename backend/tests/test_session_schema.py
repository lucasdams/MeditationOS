"""Unit tests for the SessionRead computed field (no DB needed)."""

import uuid
from datetime import UTC, datetime

from app.schemas.session import SessionRead


def _make(**overrides) -> SessionRead:
    data = {
        "id": uuid.uuid4(),
        "type": "resonance_breathing",
        "duration_seconds": 600,
        "occurred_at": datetime(2026, 1, 1, 8, 0, tzinfo=UTC),
        "notes": None,
        "inhale_seconds": None,
        "exhale_seconds": None,
        "cycles_completed": None,
        "created_at": datetime.now(UTC),
    }
    data.update(overrides)
    return SessionRead(**data)


def test_breaths_per_minute_is_computed():
    assert _make(inhale_seconds=5, exhale_seconds=5).breaths_per_minute == 6.0
    assert _make(inhale_seconds=15, exhale_seconds=5).breaths_per_minute == 3.0
    assert _make(inhale_seconds=20, exhale_seconds=20).breaths_per_minute == 1.5


def test_breaths_per_minute_none_when_breathing_fields_missing():
    assert _make().breaths_per_minute is None
    assert _make(inhale_seconds=5).breaths_per_minute is None  # needs both

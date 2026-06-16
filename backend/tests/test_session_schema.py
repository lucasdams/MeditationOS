"""Unit tests for the SessionRead computed field (no DB needed)."""

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.session import SessionCreate, SessionRead


def _make(**overrides) -> SessionRead:
    data = {
        "id": uuid.uuid4(),
        "type": "resonance_breathing",
        "duration_seconds": 600,
        "occurred_at": datetime(2026, 1, 1, 8, 0, tzinfo=UTC),
        "notes": None,
        "focus": None,
        "calm": None,
        "inhale_seconds": None,
        "exhale_seconds": None,
        "cycles_completed": None,
        "intention": None,
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


# ── Intention field ──────────────────────────────────────────────────────────

_BASE_CREATE = {
    "type": "mindfulness",
    "duration_seconds": 600,
    "occurred_at": "2026-01-01T08:00:00",
}


def test_intention_accepted():
    sc = SessionCreate(**{**_BASE_CREATE, "intention": "Stay present"})
    assert sc.intention == "Stay present"


def test_intention_trimmed():
    sc = SessionCreate(**{**_BASE_CREATE, "intention": "  Be here  "})
    assert sc.intention == "Be here"


def test_intention_blank_becomes_none():
    sc = SessionCreate(**{**_BASE_CREATE, "intention": "   "})
    assert sc.intention is None


def test_intention_none_accepted():
    sc = SessionCreate(**{**_BASE_CREATE, "intention": None})
    assert sc.intention is None


def test_intention_omitted_defaults_none():
    sc = SessionCreate(**_BASE_CREATE)
    assert sc.intention is None


def test_intention_over_140_chars_rejected():
    long_str = "x" * 141
    with pytest.raises(ValidationError):
        SessionCreate(**{**_BASE_CREATE, "intention": long_str})

"""Drift guard for the data export.

Iterates every table on `Base.metadata` that has a `user_id` column and asserts each is
either represented in the export payload (`ExportData`) or in the explicit excludes set
(`user_service._EXPORT_EXCLUDED`). This catches a future user-owned table silently
dropping out of the portable export.
"""

import app.models  # noqa: F401  — register every model on Base.metadata
from app.core.db import Base
from app.schemas.user import ExportData
from app.services.user_service import _EXPORT_EXCLUDED

# How each exported table name maps to its key in the export payload. Most match by their
# table name; the few that don't are listed here so the guard knows they're covered.
_TABLE_TO_EXPORT_KEY = {
    "sessions": "sessions",
    "gratitude_entries": "gratitude",
    "journals": "journals",
    "mood_logs": "mood_logs",
    "goals": "goals",
    "goal_checkins": "goal_checkins",
    "spirits": "spirits",
    "biometric_readings": "biometric_readings",
    "scheduled_sessions": "scheduled_sessions",
    "breathing_patterns": "breathing_patterns",
    "path_enrollments": "path_enrollments",
}


def test_every_user_owned_table_is_exported_or_explicitly_excluded():
    export_keys = set(ExportData.model_fields)
    owned_tables = [
        name
        for name, table in Base.metadata.tables.items()
        if "user_id" in table.columns
    ]
    assert owned_tables, "expected at least one user-owned table"

    for table_name in owned_tables:
        if table_name in _EXPORT_EXCLUDED:
            continue
        key = _TABLE_TO_EXPORT_KEY.get(table_name)
        assert key is not None, (
            f"user-owned table {table_name!r} is neither mapped into the export nor "
            f"in _EXPORT_EXCLUDED — add it to the export or excludes set"
        )
        assert key in export_keys, (
            f"export key {key!r} for table {table_name!r} is missing from ExportData"
        )


def test_excluded_tables_are_real_user_referencing_tables():
    # Guard the guard: every name in the excludes set must be a real table that
    # references a user (a `user_id` or `*_user_id` column), so the set can't drift into
    # listing non-existent or unrelated tables.
    for name in _EXPORT_EXCLUDED:
        table = Base.metadata.tables.get(name)
        assert table is not None, f"excluded table {name!r} not found on Base.metadata"
        assert any(c.name.endswith("user_id") for c in table.columns), (
            f"excluded table {name!r} references no user"
        )

"""Test that Alembic migrations execute cleanly from base to head and back.

This test catches two classes of bugs that `Base.metadata.create_all` (used in the
main test conftest) silently misses:
  1. Mis-parented revision chains (multiple heads, broken parent links).
  2. Model/migration drift (a column exists in the ORM but no migration adds it, or
     vice-versa — detected by an autogenerate diff after upgrade head).
  3. Missing ON DELETE CASCADE: account-delete depends entirely on DB-level cascades
     (there are no ORM `cascade=` relationships), so a residual-rows test guards that
     every user-owned table actually deletes when the user is deleted.

Strategy
--------
We create a *throwaway* scratch database (``meditationos_migrations_test``) so this
test never touches ``meditationos_test`` and is safe to run in parallel with the
regular test suite.  If the database server is unreachable the test is skipped cleanly.

We use subprocess to call the `alembic` CLI with DATABASE_URL pointing at the scratch
DB so that env.py picks up the right URL without touching the main test database.
"""

import os
import subprocess
import sys

import pytest
from sqlalchemy import create_engine, text

import app.models  # noqa: F401 — register all models on Base.metadata
from app.core.config import settings
from app.core.db import Base

# ── constants ─────────────────────────────────────────────────────────────────

_BASE_URL = settings.database_url.rsplit("/", 1)[0]
SCRATCH_DB = "meditationos_migrations_test"
SCRATCH_DB_URL = f"{_BASE_URL}/{SCRATCH_DB}"

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALEMBIC_INI = os.path.join(BACKEND_DIR, "alembic.ini")
PYTHON = sys.executable

# Env for subprocess alembic calls: DATABASE_URL points at the scratch DB.
_ALEMBIC_ENV = {
    **os.environ,
    "DATABASE_URL": SCRATCH_DB_URL,
    "SECRET_KEY": os.environ.get("SECRET_KEY", "ci-test-secret"),
    "ENVIRONMENT": "test",
}


def _run_alembic(*args: str) -> subprocess.CompletedProcess:
    """Run an alembic CLI command in the backend directory."""
    return subprocess.run(
        [PYTHON, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=_ALEMBIC_ENV,
        capture_output=True,
        text=True,
    )


# ── fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def scratch_engine():
    """Create the scratch database, yield an engine, then tear it down."""
    try:
        admin_engine = create_engine(
            f"{_BASE_URL}/postgres", isolation_level="AUTOCOMMIT"
        )
        with admin_engine.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {SCRATCH_DB}"))
            conn.execute(text(f"CREATE DATABASE {SCRATCH_DB}"))
        admin_engine.dispose()
    except Exception as exc:
        pytest.skip(f"Cannot connect to Postgres to create scratch DB: {exc}")

    engine = create_engine(SCRATCH_DB_URL)
    # citext is required by the users table.
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))

    yield engine

    engine.dispose()
    try:
        admin_engine = create_engine(
            f"{_BASE_URL}/postgres", isolation_level="AUTOCOMMIT"
        )
        with admin_engine.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {SCRATCH_DB}"))
        admin_engine.dispose()
    except Exception:
        pass  # best-effort cleanup


# ── helpers ───────────────────────────────────────────────────────────────────


def _current_revision(engine) -> str | None:
    from alembic.migration import MigrationContext
    with engine.connect() as conn:
        mc = MigrationContext.configure(conn)
        return mc.get_current_revision()


# ── tests (order matters: they share the scratch DB state) ────────────────────


def test_single_alembic_head():
    """The migration chain must have exactly one head (no merge conflicts).

    This test does NOT need a DB connection — it inspects the revision files only.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, (
        f"Expected a single Alembic head but found {len(heads)}: {heads}. "
        "Run `alembic merge heads` to fix diverged branches."
    )


def test_upgrade_head_succeeds(scratch_engine):
    """alembic upgrade head must complete without errors on a fresh database."""
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, (
        f"alembic upgrade head failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    # Confirm Alembic records the current revision.
    current = _current_revision(scratch_engine)
    assert current is not None, "upgrade head returned but no revision is recorded"


def test_downgrade_base_succeeds(scratch_engine):
    """alembic downgrade base must complete without errors (rollback path)."""
    result = _run_alembic("downgrade", "base")
    assert result.returncode == 0, (
        f"alembic downgrade base failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    current = _current_revision(scratch_engine)
    assert current is None, (
        f"After downgrade base revision should be None; got {current!r}"
    )


def test_upgrade_head_again_succeeds(scratch_engine):
    """Second upgrade from base to head must also succeed (idempotent + complete chain)."""
    result = _run_alembic("upgrade", "head")
    assert result.returncode == 0, (
        f"Second alembic upgrade head failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    current = _current_revision(scratch_engine)
    assert current is not None, "Second upgrade head returned but no revision is recorded"


def test_autogenerate_diff_is_empty(scratch_engine):
    """After upgrade head, the ORM metadata must match the DB schema exactly.

    A non-empty diff means a model was changed without a matching migration (or vice
    versa) — the most common source of silent drift.
    """
    from alembic import autogenerate
    from alembic.migration import MigrationContext

    with scratch_engine.connect() as conn:
        mc = MigrationContext.configure(
            conn,
            opts={
                "compare_type": True,
                "compare_server_default": True,
            },
        )
        diff = autogenerate.compare_metadata(mc, Base.metadata)

    assert diff == [], (
        f"Alembic autogenerate found {len(diff)} schema difference(s) "
        f"between the ORM models and the migrated DB — add a new migration to fix:\n"
        + "\n".join(str(d) for d in diff)
    )


def test_account_delete_cascades_to_all_owned_tables(scratch_engine):
    """Deleting a user must leave zero residual rows in every user-owned table.

    account-delete (`DELETE /auth/me`) relies entirely on DB-level `ON DELETE CASCADE`
    (there are no ORM `cascade=` relationships), so this test exercises the real
    Postgres FK behaviour on the schema built by alembic upgrade head.

    The intentional exception is `audit_logs`: both `actor_user_id` and
    `target_user_id` use `ON DELETE SET NULL`, so the rows survive with the FK
    nulled (the audit trail outlives any individual account).
    """
    import datetime
    import uuid

    from sqlalchemy import text

    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    goal_id = uuid.uuid4()
    audit_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.UTC)
    today = datetime.date.today()

    with scratch_engine.begin() as conn:
        # ── user ──────────────────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, email_verified, is_guest,"
                " is_disabled, timezone, created_at) VALUES (:id, :email, 'hash', false,"
                " false, false, 'UTC', :now)"
            ),
            {"id": user_id, "email": f"cascade_test_{user_id.hex[:8]}@example.com", "now": now},
        )

        # ── sessions ──────────────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO sessions (id, user_id, type, duration_seconds, occurred_at,"
                " created_at) VALUES (:id, :uid, 'mindfulness', 300, :now, :now)"
            ),
            {"id": session_id, "uid": user_id, "now": now},
        )

        # ── journals ──────────────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO journals (id, user_id, body, created_at)"
                " VALUES (:id, :uid, 'test', :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── gratitude_entries ─────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO gratitude_entries (id, user_id, category, text, created_at)"
                " VALUES (:id, :uid, 'people', 'thanks', :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── mood_logs ─────────────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO mood_logs (id, user_id, mood, created_at)"
                " VALUES (:id, :uid, 'calm', :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── goals + goal_checkins ─────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO goals (id, user_id, activity, period, count, status, created_at)"
                " VALUES (:id, :uid, 'custom', 'day', 1, 'active', :now)"
            ),
            {"id": goal_id, "uid": user_id, "now": now},
        )
        conn.execute(
            text(
                "INSERT INTO goal_checkins (id, goal_id, user_id, checkin_date, created_at)"
                " VALUES (:id, :gid, :uid, :today, :now)"
            ),
            {"id": uuid.uuid4(), "gid": goal_id, "uid": user_id, "today": today, "now": now},
        )

        # ── scheduled_sessions ────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO scheduled_sessions (id, user_id, type, scheduled_at, created_at)"
                " VALUES (:id, :uid, 'mindfulness', :now, :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── biometric_readings ────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO biometric_readings (id, user_id, context, bpm, source,"
                " measured_at, created_at, updated_at)"
                " VALUES (:id, :uid, 'resting', 65, 'manual', :now, :now, :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── push_subscriptions ────────────────────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth,"
                " created_at) VALUES (:id, :uid, 'https://example.com/push', 'pk', 'ak',"
                " :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── breathing_patterns (user-owned) ───────────────────────────────────
        conn.execute(
            text(
                "INSERT INTO breathing_patterns (id, user_id, name, inhale_seconds,"
                " exhale_seconds, is_preset, created_at)"
                " VALUES (:id, :uid, '4-4', 4, 4, false, :now)"
            ),
            {"id": uuid.uuid4(), "uid": user_id, "now": now},
        )

        # ── audit_logs (intentional exception: SET NULL, not CASCADE) ─────────
        conn.execute(
            text(
                "INSERT INTO audit_logs (id, actor_user_id, target_user_id, action,"
                " created_at) VALUES (:id, :uid, :uid, 'test_action', :now)"
            ),
            {"id": audit_id, "uid": user_id, "now": now},
        )

    # ── delete the user ───────────────────────────────────────────────────────
    with scratch_engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})

    # ── assert no residual rows in owned tables ───────────────────────────────
    owned_tables = [
        "sessions",
        "journals",
        "gratitude_entries",
        "mood_logs",
        "goals",
        "goal_checkins",
        "scheduled_sessions",
        "biometric_readings",
        "push_subscriptions",
        "breathing_patterns",
    ]
    with scratch_engine.connect() as conn:
        for table in owned_tables:
            count = conn.execute(
                text(f"SELECT COUNT(*) FROM {table} WHERE user_id = :uid"),  # noqa: S608
                {"uid": user_id},
            ).scalar()
            assert count == 0, (
                f"Expected 0 rows in {table} after user delete, got {count} — "
                "the ON DELETE CASCADE FK may be missing or wrong"
            )

        # audit_logs: rows survive but FKs are nulled (SET NULL, not CASCADE)
        audit_row = conn.execute(
            text("SELECT actor_user_id, target_user_id FROM audit_logs WHERE id = :id"),
            {"id": audit_id},
        ).mappings().one()
        assert audit_row["actor_user_id"] is None, (
            "audit_logs.actor_user_id should be NULL after user delete (ON DELETE SET NULL)"
        )
        assert audit_row["target_user_id"] is None, (
            "audit_logs.target_user_id should be NULL after user delete (ON DELETE SET NULL)"
        )

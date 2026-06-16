"""Test that Alembic migrations execute cleanly from base to head and back.

This test catches two classes of bugs that `Base.metadata.create_all` (used in the
main test conftest) silently misses:
  1. Mis-parented revision chains (multiple heads, broken parent links).
  2. Model/migration drift (a column exists in the ORM but no migration adds it, or
     vice-versa — detected by an autogenerate diff after upgrade head).

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
                "compare_server_default": False,  # trivial formatting differences
            },
        )
        diff = autogenerate.compare_metadata(mc, Base.metadata)

    assert diff == [], (
        f"Alembic autogenerate found {len(diff)} schema difference(s) "
        f"between the ORM models and the migrated DB — add a new migration to fix:\n"
        + "\n".join(str(d) for d in diff)
    )

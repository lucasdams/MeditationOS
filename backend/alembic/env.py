from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text

from alembic import context

# Importing the models package registers every model's table on Base.metadata
# so `alembic revision --autogenerate` can see them.
from app import models  # noqa: F401,E402
from app.core.config import settings
from app.core.db import Base

# Alembic Config object, providing access to values in alembic.ini.
config = context.config

# Inject the runtime database URL from application settings rather than
# hardcoding it in alembic.ini (keeps secrets/config in one place).
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (emits SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection.

    A PostgreSQL advisory lock serialises concurrent runners (e.g.
    multiple replicas starting simultaneously).  The second replica to acquire
    the lock will wait, then find that alembic_version is already at head and
    no-op — exactly what we want.  The constant key is arbitrary but must be
    stable across deployments.

    We use `pg_advisory_xact_lock` (transaction-scoped) rather than the
    session-scoped `pg_advisory_lock` so that the lock is acquired and released
    within Alembic's own migration transaction — no separate unlock is needed
    and there is no interaction with SQLAlchemy's autobegin transaction state.
    Alembic issues one DDL transaction per migration step (transactional DDL);
    the lock is held for the duration of each step and released at commit.
    Because all steps are sequential within a single `run_migrations()` call
    the effective serialisation is identical to a single session lock.
    """
    # Arbitrary stable bigint key — identifies the "alembic upgrade" lock.
    _ADVISORY_LOCK_KEY = 0x4D65644F53  # MedOS in hex

    def _acquire_lock(connection):
        """Execute pg_advisory_xact_lock inside the migration transaction."""
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": _ADVISORY_LOCK_KEY},
        )

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            # Acquire the transaction-scoped advisory lock before any DDL runs.
            # Released automatically when this transaction commits or rolls back.
            connection.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": _ADVISORY_LOCK_KEY},
            )
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

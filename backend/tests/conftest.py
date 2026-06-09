"""Test fixtures: a dedicated Postgres test database with per-test rollback.

Postgres (not SQLite) because the schema uses `citext`. Each test runs inside a
transaction that is rolled back afterward, so tests are isolated even though the
service layer calls `commit()` (the session joins via savepoint).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  — register models on Base.metadata
from app.core.config import settings
from app.core.db import Base, get_db
from app.main import app

_BASE = settings.database_url.rsplit("/", 1)[0]
TEST_DB_URL = f"{_BASE}/meditationos_test"


@pytest.fixture(scope="session")
def engine():
    # Create a clean test database from the maintenance DB (AUTOCOMMIT: no DDL txn).
    admin = create_engine(f"{_BASE}/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS meditationos_test"))
        conn.execute(text("CREATE DATABASE meditationos_test"))
    admin.dispose()

    eng = create_engine(TEST_DB_URL)
    with eng.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    # create_savepoint → service commits operate on a savepoint, outer txn rolls back
    Session = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

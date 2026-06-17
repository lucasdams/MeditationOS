"""Database engine, session factory, and the declarative base.

Models inherit from `Base` (added in later tickets). Request handlers get a
session via the `get_db` dependency; the session is opened per-request and
always closed. All queries live in services, never in route handlers
(see docs/decisions/0006-layered-architecture.md).
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    # Validate connections before checkout so a dropped/stale socket (e.g. RDS
    # idle timeout, failover) is transparently replaced instead of erroring.
    pool_pre_ping=True,
    # Sized from config so the pool can be tuned against the RDS connection
    # ceiling when scaling web workers (see config.py for the budget formula).
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    pool_recycle=settings.db_pool_recycle,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session, closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

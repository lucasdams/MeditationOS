"""Meditation session business logic and data access.

The DB session type is aliased `DBSession` to avoid colliding with our `Session`
model. All queries are scoped to a `user_id`.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.session import Session
from app.schemas.session import SessionCreate, SessionUpdate
from app.services._ownership import delete_owned, get_owned


def _by_client_token(db: DBSession, user_id: uuid.UUID, token: str) -> Session | None:
    return db.execute(
        select(Session).where(Session.user_id == user_id, Session.client_token == token)
    ).scalar_one_or_none()


def create_session(db: DBSession, user_id: uuid.UUID, data: SessionCreate) -> Session:
    # Idempotent on client_token: a manual save and an auto-save (beacon) of the same
    # in-progress sit collapse to one row instead of double-counting.
    if data.client_token:
        existing = _by_client_token(db, user_id, data.client_token)
        if existing is not None:
            return existing
    enforce_daily_create_cap(db, Session, user_id)
    session = Session(user_id=user_id, **data.model_dump())
    db.add(session)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent save with the same token won the race — return that row.
        db.rollback()
        if data.client_token:
            existing = _by_client_token(db, user_id, data.client_token)
            if existing is not None:
                return existing
        raise
    db.refresh(session)
    return session


def get_session(db: DBSession, user_id: uuid.UUID, session_id: uuid.UUID) -> Session | None:
    """Fetch one session owned by the user. None if missing or not theirs."""
    return get_owned(db, Session, user_id, session_id)


def update_session(
    db: DBSession, user_id: uuid.UUID, session_id: uuid.UUID, data: SessionUpdate
) -> Session | None:
    session = get_session(db, user_id, session_id)
    if session is None:
        return None
    # Only the fields the client actually sent are changed (partial update).
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: DBSession, user_id: uuid.UUID, session_id: uuid.UUID) -> bool:
    return delete_owned(db, Session, user_id, session_id)


def list_sessions(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Session]:
    stmt = select(Session).where(Session.user_id == user_id)
    # `from`/`to` filter on the calendar date of occurrence (inclusive).
    if date_from is not None:
        stmt = stmt.where(func.date(Session.occurred_at) >= date_from)
    if date_to is not None:
        stmt = stmt.where(func.date(Session.occurred_at) <= date_to)
    if type is not None:
        stmt = stmt.where(Session.type == type)
    stmt = stmt.order_by(Session.occurred_at.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())

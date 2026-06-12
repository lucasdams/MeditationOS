"""Meditation session business logic and data access.

The DB session type is aliased `DBSession` to avoid colliding with our `Session`
model. All queries are scoped to a `user_id`.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.session import Session
from app.schemas.session import SessionCreate, SessionUpdate


def create_session(db: DBSession, user_id: uuid.UUID, data: SessionCreate) -> Session:
    enforce_daily_create_cap(db, Session, user_id)
    session = Session(user_id=user_id, **data.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: DBSession, user_id: uuid.UUID, session_id: uuid.UUID) -> Session | None:
    """Fetch one session owned by the user. None if missing or not theirs."""
    stmt = select(Session).where(Session.id == session_id, Session.user_id == user_id)
    return db.execute(stmt).scalar_one_or_none()


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
    session = get_session(db, user_id, session_id)
    if session is None:
        return False
    db.delete(session)
    db.commit()
    return True


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

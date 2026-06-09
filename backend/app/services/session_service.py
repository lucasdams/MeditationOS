"""Meditation session business logic and data access.

The DB session type is aliased `DBSession` to avoid colliding with our `Session`
model. All queries are scoped to a `user_id`.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.session import Session
from app.schemas.session import SessionCreate


def create_session(db: DBSession, user_id: uuid.UUID, data: SessionCreate) -> Session:
    session = Session(user_id=user_id, **data.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


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
    if date_from is not None:
        stmt = stmt.where(Session.session_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Session.session_date <= date_to)
    if type is not None:
        stmt = stmt.where(Session.type == type)
    stmt = (
        stmt.order_by(Session.session_date.desc(), Session.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.execute(stmt).scalars().all())

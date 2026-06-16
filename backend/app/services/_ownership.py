"""Generic user-scoped row access helpers.

Every user-owned resource is fetched and deleted the same way: select by primary
key *and* owner, returning None / False when the row is missing or belongs to
someone else (never leaking another user's data). These two helpers capture that
pattern so each service doesn't re-implement it.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession


def get_owned[T](db: DBSession, model: type[T], user_id: uuid.UUID, row_id: uuid.UUID) -> T | None:
    """Fetch one `model` row by id that the user owns. None if missing or not theirs."""
    stmt = select(model).where(model.id == row_id, model.user_id == user_id)
    return db.execute(stmt).scalar_one_or_none()


def delete_owned[T](db: DBSession, model: type[T], user_id: uuid.UUID, row_id: uuid.UUID) -> bool:
    """Delete one `model` row the user owns. Returns False if it wasn't found."""
    row = get_owned(db, model, user_id, row_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True

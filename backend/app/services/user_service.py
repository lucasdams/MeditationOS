"""User business logic and data access. Routes call into here; they never
touch the database directly (see docs/decisions/0006-layered-architecture.md).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import EmailAlreadyExistsError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def create_user(db: Session, data: UserCreate) -> User:
    """Create a user, hashing the password. Raises if the email is taken."""
    if get_user_by_email(db, data.email) is not None:
        raise EmailAlreadyExistsError(data.email)

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

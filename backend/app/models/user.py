"""User model. See docs/design/data-model.md for the schema rationale."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # citext → case-insensitive uniqueness (A@x.com == a@x.com)
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    # Public display name, distinct from email. Null until the user picks one.
    username: Mapped[str | None] = mapped_column(CITEXT, unique=True, nullable=True)
    # Nullable: Google-only accounts have no password. Email/password users do.
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # Google's stable subject id ("sub"), set when the account is linked to Google.
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    # IANA timezone (e.g. "Asia/Tokyo") for local-day streaks/quests. Default UTC.
    timezone: Mapped[str] = mapped_column(
        String, nullable=False, server_default="UTC", default="UTC"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @property
    def has_password(self) -> bool:
        """Whether this account can sign in with a password (vs. Google-only).

        Surfaced to clients (never the hash itself) so the UI shows "change
        password" for password accounts and "set a password" for Google-only ones.
        """
        return self.password_hash is not None

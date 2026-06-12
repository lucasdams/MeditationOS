"""User model. See docs/design/data-model.md for the schema rationale."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
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
    # Whether the email address is confirmed. Google sign-in arrives verified;
    # email/password accounts confirm via an emailed link.
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    # An anonymous "try it without signing up" account: a synthetic email, no
    # password. The user can later *claim* it (set a real email + password), which
    # flips this to false. Surfaced so the UI can nudge guests to save their data.
    is_guest: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    # Google's stable subject id ("sub"), set when the account is linked to Google.
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    # IANA timezone (e.g. "Asia/Tokyo") for local-day streaks/quests. Default UTC.
    timezone: Mapped[str] = mapped_column(
        String, nullable=False, server_default="UTC", default="UTC"
    )
    # Daily practice reminder (opt-in). Fires at `reminder_hour` (0–23) in the
    # user's local timezone; `reminder_last_sent_at` guards against double-sends.
    reminder_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    reminder_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reminder_last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

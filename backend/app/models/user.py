"""User model. See docs/design/data-model.md for the schema rationale."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.db import Base

# The daily activities a user can opt into receiving quests for (they choose ≥3).
# Mirrors GOAL_ACTIVITIES in app/models/goal.py — the same vocabulary of practices.
QUEST_FEATURES = ("meditate", "breathe", "gratitude", "journal")


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
    # Admin-controlled account suspension. A disabled account is blocked at
    # authentication (get_current_user → 403) so the user can neither log in nor use an
    # existing session, without losing their data. Toggled only by admin support
    # tooling (see admin_users_service.set_user_disabled); every change is audited.
    is_disabled: Mapped[bool] = mapped_column(
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
    # Late-day streak-save nudge: sent at most once per user per local day, only when an
    # active streak would break without practice and the local hour is ≥ 20:00.
    # Tracked separately from `reminder_last_sent_at` so the two channels are independent.
    streak_save_last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Weekly summary email (opt-in). Sent on `weekly_summary_day` (0=Mon … 6=Sun, the
    # user's local weekday); `weekly_summary_last_sent_at` makes it once-per-week.
    weekly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    weekly_summary_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weekly_summary_last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Which daily-activity quests the user opted into (a subset of QUEST_FEATURES,
    # ≥3). NULL until they choose: the client shows a first-run picker, and quest
    # generation falls back to all four while NULL. Existing users were backfilled
    # to all four; guests are seeded with all four at creation.
    quest_features: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
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

    @property
    def is_admin(self) -> bool:
        """Whether this account is an admin, derived from the ADMIN_EMAILS allowlist.

        Computed (not stored): a migration-free designation matching the app's
        env-config ethos. Surfaced to clients so the UI can gate admin nav/routes,
        and enforced server-side by the `require_admin` dependency. Guests have a
        synthetic email that won't be in the allowlist, so they can never be admins.

        Email verification is required regardless of the global
        REQUIRE_EMAIL_VERIFICATION flag: an unverified registrant of an allowlisted
        address must not gain admin access before proving ownership of that address.
        Google sign-ins arrive pre-verified (email_verified=True), so they are not
        affected.
        """
        return (
            bool(self.email)
            and self.email_verified
            and self.email.lower() in settings.admin_emails_set
        )

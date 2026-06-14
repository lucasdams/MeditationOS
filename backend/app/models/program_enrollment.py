"""Program enrollment — a user's progress through a multi-day program. The program
catalog is static (in code; see services/program_catalog.py), so the only stored state
is enrollment + progress here. Progress is advanced by an explicit "day complete"
action (like custom-habit check-ins — a deliberate stored-progress path, cf. ADR-0009).
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProgramEnrollment(Base):
    __tablename__ = "program_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # References a key in the in-code catalog (validated in the service, not an FK).
    program_key: Mapped[str] = mapped_column(String, nullable=False)
    # 1-based: the next day to do. Past the last day → completed_at is set.
    current_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    completed_at: Mapped[datetime | None] = mapped_column(
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

    __table_args__ = (
        CheckConstraint("current_day >= 1", name="ck_program_enrollments_day_positive"),
        Index("ix_program_enrollments_user_id", "user_id"),
    )

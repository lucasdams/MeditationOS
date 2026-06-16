"""Biometric reading model — a heart-rate (and optional HRV) data point.

Source-agnostic by design: a reading can come from manual entry, an estimate, or
later a camera-PPG / wearable import (the `source` column extends without a schema
change). The optional `session_id` links a reading to a practice sit; a `context`
of `pre`/`post`/`resting` lets a pre/post pair around a sit surface the calming
delta later. These are a personal wellness signal, NOT a clinical measurement.

See docs/decisions/0017-biometric-readings-data-model.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# When a reading was taken relative to a sit. A `pre`/`post` pair shows the
# immediate calming effect; `resting` is a standalone baseline.
READING_CONTEXTS = ("pre", "post", "resting")
_CONTEXT_LIST = ", ".join(f"'{c}'" for c in READING_CONTEXTS)

# Where the numbers came from. Manual/estimated ship now; camera/wearable later
# plug in here without a migration.
READING_SOURCES = ("manual", "estimated", "camera", "wearable")
_SOURCE_LIST = ", ".join(f"'{s}'" for s in READING_SOURCES)


class BiometricReading(Base):
    __tablename__ = "biometric_readings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Optional link to the sit this reading belongs to. SET NULL so deleting a
    # session keeps the reading (the data point is still the user's history).
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    context: Mapped[str] = mapped_column(String, nullable=False)
    # Heart rate in beats per minute.
    bpm: Mapped[int] = mapped_column(Integer, nullable=False)
    # Optional HRV (e.g. RMSSD in ms) — manual entry may only have heart rate.
    hrv_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False, server_default="manual")
    # When the reading was taken (user-set, tz-aware).
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Optional client-generated idempotency key, so a rapid double-submit of the same
    # reading collapses to one row (keeps the pre/post delta deterministic).
    client_token: Mapped[str | None] = mapped_column(String, nullable=True)

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
        CheckConstraint("bpm BETWEEN 30 AND 220", name="ck_biometric_readings_bpm"),
        CheckConstraint("hrv_ms IS NULL OR hrv_ms >= 0", name="ck_biometric_readings_hrv"),
        CheckConstraint(f"context IN ({_CONTEXT_LIST})", name="ck_biometric_readings_context"),
        CheckConstraint(f"source IN ({_SOURCE_LIST})", name="ck_biometric_readings_source"),
        # The trend view queries by user over time.
        Index("ix_biometric_readings_user_id_measured_at", "user_id", "measured_at"),
        # Looking up readings attached to a sit (pre/post pairing).
        Index("ix_biometric_readings_session_id", "session_id"),
        # One row per (user, client_token) — enforces idempotent saves at the DB level.
        Index(
            "uq_biometric_readings_user_client_token",
            "user_id",
            "client_token",
            unique=True,
            postgresql_where=text("client_token IS NOT NULL"),
        ),
    )

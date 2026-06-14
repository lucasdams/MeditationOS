"""Program enrollment logic. The catalog is static (program_catalog.py); this owns the
stored per-user progress. All queries scoped to the user."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import UnknownProgramError
from app.models.program_enrollment import ProgramEnrollment
from app.schemas.program import (
    EnrollmentRead,
    ProgramDayRead,
    ProgramDetail,
    ProgramSummary,
)
from app.services import program_catalog


def list_catalog() -> list[ProgramSummary]:
    return [
        ProgramSummary(
            key=p.key,
            title=p.title,
            description=p.description,
            category=p.category,
            total_days=len(p.days),
        )
        for p in program_catalog.list_programs()
    ]


def get_catalog_detail(key: str) -> ProgramDetail | None:
    p = program_catalog.get_program(key)
    if p is None:
        return None
    return ProgramDetail(
        key=p.key,
        title=p.title,
        description=p.description,
        category=p.category,
        total_days=len(p.days),
        days=[
            ProgramDayRead(day=i + 1, title=d.title, activity=d.activity, detail=d.detail)
            for i, d in enumerate(p.days)
        ],
    )


def _to_read(row: ProgramEnrollment) -> EnrollmentRead:
    program = program_catalog.get_program(row.program_key)
    total = len(program.days) if program else 0
    completed = row.completed_at is not None
    today = None
    if program and not completed and 1 <= row.current_day <= total:
        d = program.days[row.current_day - 1]
        today = ProgramDayRead(
            day=row.current_day, title=d.title, activity=d.activity, detail=d.detail
        )
    return EnrollmentRead(
        id=row.id,
        program_key=row.program_key,
        title=program.title if program else row.program_key,
        total_days=total,
        current_day=row.current_day,
        completed=completed,
        today=today,
        started_at=row.created_at,
    )


def _active_for(
    db: DBSession, user_id: uuid.UUID, program_key: str
) -> ProgramEnrollment | None:
    stmt = select(ProgramEnrollment).where(
        ProgramEnrollment.user_id == user_id,
        ProgramEnrollment.program_key == program_key,
        ProgramEnrollment.completed_at.is_(None),
    )
    return db.execute(stmt).scalar_one_or_none()


def enroll(db: DBSession, user_id: uuid.UUID, program_key: str) -> EnrollmentRead:
    if program_catalog.get_program(program_key) is None:
        raise UnknownProgramError(program_key)
    # Idempotent: an existing active enrollment is returned rather than duplicated.
    existing = _active_for(db, user_id, program_key)
    if existing is not None:
        return _to_read(existing)
    row = ProgramEnrollment(user_id=user_id, program_key=program_key, current_day=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


def list_enrollments(db: DBSession, user_id: uuid.UUID) -> list[EnrollmentRead]:
    stmt = (
        select(ProgramEnrollment)
        .where(ProgramEnrollment.user_id == user_id)
        .order_by(ProgramEnrollment.created_at.desc())
    )
    return [_to_read(r) for r in db.execute(stmt).scalars().all()]


def get(
    db: DBSession, user_id: uuid.UUID, enrollment_id: uuid.UUID
) -> ProgramEnrollment | None:
    stmt = select(ProgramEnrollment).where(
        ProgramEnrollment.id == enrollment_id, ProgramEnrollment.user_id == user_id
    )
    return db.execute(stmt).scalar_one_or_none()


def advance(
    db: DBSession, user_id: uuid.UUID, enrollment_id: uuid.UUID
) -> EnrollmentRead | None:
    """Mark the current day done. Advances to the next day; completes the program when
    the last day is finished. No-op once already complete."""
    row = get(db, user_id, enrollment_id)
    if row is None:
        return None
    if row.completed_at is not None:
        return _to_read(row)
    program = program_catalog.get_program(row.program_key)
    total = len(program.days) if program else 0
    if row.current_day >= total:
        row.completed_at = datetime.now(UTC)
    else:
        row.current_day += 1
    db.commit()
    db.refresh(row)
    return _to_read(row)


def leave(db: DBSession, user_id: uuid.UUID, enrollment_id: uuid.UUID) -> bool:
    row = get(db, user_id, enrollment_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True

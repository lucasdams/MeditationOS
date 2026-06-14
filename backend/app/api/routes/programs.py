"""Program routes — a static catalog of multi-day plans + per-user enrollment/progress.
Thin handlers; logic in program_service; enrollment data scoped to the user."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.exceptions import UnknownProgramError
from app.models.user import User
from app.schemas.program import (
    EnrollmentCreate,
    EnrollmentRead,
    ProgramDetail,
    ProgramSummary,
)
from app.services import program_service

router = APIRouter(prefix="/programs", tags=["programs"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@router.get("", response_model=list[ProgramSummary])
def list_programs() -> list[ProgramSummary]:
    return program_service.list_catalog()


# --- enrollments (declared before /{key} so the paths don't collide) -------------


@router.get("/enrollments", response_model=list[EnrollmentRead])
def list_enrollments(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EnrollmentRead]:
    return program_service.list_enrollments(db, current_user.id)


@router.post("/enrollments", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
def enroll(
    data: EnrollmentCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EnrollmentRead:
    try:
        return program_service.enroll(db, current_user.id, data.program_key)
    except UnknownProgramError:
        raise _NOT_FOUND from None


@router.post("/enrollments/{enrollment_id}/advance", response_model=EnrollmentRead)
def advance(
    enrollment_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EnrollmentRead:
    result = program_service.advance(db, current_user.id, enrollment_id)
    if result is None:
        raise _NOT_FOUND
    return result


@router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def leave(
    enrollment_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not program_service.leave(db, current_user.id, enrollment_id):
        raise _NOT_FOUND


@router.get("/{key}", response_model=ProgramDetail)
def get_program(key: str) -> ProgramDetail:
    detail = program_service.get_catalog_detail(key)
    if detail is None:
        raise _NOT_FOUND
    return detail

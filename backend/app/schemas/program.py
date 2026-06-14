"""Program catalog + enrollment schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class ProgramDayRead(BaseModel):
    day: int  # 1-based
    title: str
    activity: str
    detail: str


class ProgramSummary(BaseModel):
    key: str
    title: str
    description: str
    category: str
    total_days: int


class ProgramDetail(ProgramSummary):
    days: list[ProgramDayRead]


class EnrollmentRead(BaseModel):
    """A user's progress, joined with the catalog so the client can render it."""

    id: uuid.UUID
    program_key: str
    title: str
    total_days: int
    current_day: int
    completed: bool
    today: ProgramDayRead | None  # the day to do next; None once completed
    started_at: datetime


class EnrollmentCreate(BaseModel):
    program_key: str

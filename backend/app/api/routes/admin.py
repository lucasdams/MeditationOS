"""Admin routes. The WHOLE router is gated by `require_admin` (default-deny): an
unauthenticated caller gets 401, a non-admin gets 403, before any handler runs.

Handlers stay thin — aggregation lives in `admin_service`.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.deps import require_admin
from app.core.db import get_db
from app.schemas.admin import AdminMetrics
from app.services import admin_service

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/metrics", response_model=AdminMetrics)
def get_metrics(db: DBSession = Depends(get_db)) -> AdminMetrics:
    """Aggregate business metrics across the whole user base (counts/sums only)."""
    return admin_service.get_admin_metrics(db)

"""Health probes.

`/health` is liveness — no auth, no DB, just confirms the process is serving.
`/health/ready` is readiness — runs a cheap `SELECT 1` so an orchestrator/LB
only routes traffic once the DB is reachable. Point the load-balancer health
check at the readiness endpoint.
"""

import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core.db import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — answers as long as the process is up."""
    return {"status": "ok"}


@router.get("/health/ready")
def readiness(response: Response) -> dict[str, str]:
    """Readiness probe — 200 when the DB answers, 503 when it doesn't.

    Uses a short-lived session and a trivial `SELECT 1`. Returns 503 (not 500)
    on failure so an orchestrator drains traffic instead of treating it as an
    app crash. No auth — probes run unauthenticated.
    """
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        # Don't leak DB errors to the probe response; log for diagnosis.
        logger.warning("Readiness check failed: database unreachable", exc_info=True)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable"}
    finally:
        db.close()

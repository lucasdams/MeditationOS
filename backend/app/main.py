"""MeditationOS API entrypoint.

Ticket #1 scaffold: boots a minimal FastAPI app so the backend container runs
under Docker Compose. Settings loading, the `/api/v1/health` route, and routers
are added in ticket #2 (FastAPI app skeleton + config).
"""

from fastapi import FastAPI

app = FastAPI(title="MeditationOS API")


@app.get("/")
def root() -> dict[str, str]:
    """Proof-of-life for the scaffold. Replaced by /api/v1/health in ticket #2."""
    return {"service": "meditationos-api", "status": "scaffold"}

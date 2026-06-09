#!/bin/sh
# Container startup: apply migrations, then launch the API.
# Compose health-gates this on Postgres, so the DB is ready before we migrate.
set -e

echo "Applying database migrations..."
alembic upgrade head

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

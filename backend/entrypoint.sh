#!/bin/sh
# Container startup: apply migrations, then launch the API.
# Compose health-gates this on Postgres, so the DB is ready before we migrate.
set -e

echo "Applying database migrations..."
alembic upgrade head

# Production by default: gunicorn with uvicorn workers (multi-process, no file
# watcher). Set DEV_RELOAD=1 (local docker-compose does) for single-worker
# uvicorn with hot-reload. WEB_CONCURRENCY tunes the production worker count.
if [ "$DEV_RELOAD" = "1" ]; then
  echo "Starting API (dev: uvicorn --reload)..."
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  echo "Starting API (prod: gunicorn + uvicorn workers)..."
  exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    --workers "${WEB_CONCURRENCY:-2}" \
    --bind 0.0.0.0:8000
fi

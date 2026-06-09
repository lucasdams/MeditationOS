# Infrastructure Standards

Read when editing `docker-compose.yml`, Dockerfiles, `**/docker/**`, GitHub Actions, or AWS deployment config.

## Docker (local)

- `docker-compose.yml` at repo root: `frontend`, `backend`, `database`.
- `.env.example` documents variable names; never commit `.env`.
- Backend waits for Postgres health before running migrations.

## Configuration

- Env vars only: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, etc.
- No hardcoded production URLs in source.
- Separate development and production config.

## AWS (production)

- RDS for PostgreSQL; EC2 (or container) for app runtime.
- Secrets via environment or Parameter Store, not images or git.
- Structured logs to stdout for CloudWatch.

## Do Not

- Commit AWS keys, passwords in connection strings, or `.pem` files.
- Change production infra without explicit request and a rollback plan.

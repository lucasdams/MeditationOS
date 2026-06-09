# Database Standards

Read when editing models (`backend/app/models/`), queries, or Alembic migrations.

## Schema

- User-owned rows: `user_id` FK to `users` with explicit `ON DELETE` behavior.
- Primary keys: **UUID** (`uuid4`) for all tables unless already established otherwise.
- Mutable rows: `created_at` and `updated_at` timestamps.
- Index FKs and filter columns (`user_id`, `session_date`, etc.).

## Queries

- SQLAlchemy only. No string-interpolated SQL.
- Filter by `user_id` on all tenant-scoped tables in application code.
- Queries live in services, not route handlers.

## Migrations (Alembic)

- One logical change per migration file.
- Implement `downgrade` when practical.
- Never edit applied migrations on shared/production DBs; add a new file instead.
- Name clearly: `add_sessions_table`, `add_breathing_patterns`.

## Models vs Schemas

- ORM: `backend/app/models/`
- Pydantic: `backend/app/schemas/`
- Do not expose ORM models directly from API routes.

# Backend Standards (FastAPI / Python)

Applies to `backend/**/*.py`. See root `CLAUDE.md` for project-wide rules.

## API Design

- REST under `/api/v1/` (e.g. `/api/v1/sessions`, not `/getSessions`).
- Validate input with Pydantic; return 422 on validation failure.
- Status codes: 201 create, 204 delete, 404 not found, 401/403 auth failures.
- Scope all user data to the authenticated user.

## Structure

| Layer | Location |
|-------|----------|
| Routes | `backend/app/api/routes/` (thin handlers) |
| Business logic | `backend/app/services/` |
| ORM models | `backend/app/models/` |
| Request/response | `backend/app/schemas/` |
| Auth, config, deps | `backend/app/core/` |

- Domain exceptions in services; map to HTTP in routes.
- Never return ORM models from endpoints; use Pydantic response schemas.

## Security

- SQLAlchemy ORM/Core only. No interpolated SQL.
- Do not log secrets, tokens, or credential request bodies.
- For auth flows or user-data routes, read `.claude/rules/security.md` first.

## Testing

- New endpoints: happy path, auth required, invalid input.
- Run `pytest` before marking work complete.

## Do Not

- Put business logic in route handlers.
- Query the database directly from routes (go through services).

## Related Rules (read on demand)

- `.claude/rules/database.md` — models, queries, Alembic migrations.
- `.claude/rules/ai-product.md` — V3 LLM integration and prompts.
- `.claude/rules/security.md` — auth, tokens, user-scoped data.

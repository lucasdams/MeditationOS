# New Feature Checklist

Read when implementing a GitHub Issue end to end, from ticket to PR.
Implement one GitHub Issue at a time. Verify each item before marking done.

## Backend

- [ ] Alembic migration if schema changes
- [ ] SQLAlchemy model + Pydantic schemas
- [ ] Service layer for business logic
- [ ] Route with auth + validation
- [ ] Queries scoped to `user_id`
- [ ] Pytest: happy path, auth required, invalid input

## Frontend

- [ ] API call in `frontend/src/services/`
- [ ] Loading, error, and empty states
- [ ] Form validation before submit
- [ ] Types match backend responses

## Cross-Cutting

- [ ] Ticket acceptance criteria met
- [ ] No unrelated file changes
- [ ] `.env.example` updated if new env vars
- [ ] OpenAPI `/docs` still accurate
- [ ] Manual smoke test (login, core flow, mobile width for UI)
- [ ] Security checklist pass for data routes

## Before PR

- [ ] Branch linked to GitHub Issue
- [ ] PR references acceptance criteria
- [ ] Developer reviewed full diff

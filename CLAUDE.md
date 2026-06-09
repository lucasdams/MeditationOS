# MeditationOS — Claude Code Guide

Rules describe **how** to build (patterns and conventions). **What** to build lives in GitHub Issues.

This file is always loaded. Domain rules live in nested `CLAUDE.md` files (loaded when you work in that area) and in `.claude/rules/` (read on demand — see [Specialized rules](#specialized-rules)).

## What We Are Building

MeditationOS is a B2C wellness **business application**: practice tracking, HRV resonance breathing, streaks, journaling, analytics, and (V3) AI coaching. Data-first, not a guided-audio content library.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React, TypeScript, Vite |
| Backend | FastAPI, Python, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Infra | Docker, Docker Compose, AWS (EC2, RDS, S3, CloudWatch) |
| Workflow | GitHub Issues (tickets), PRs, two-week cycles |

## Folder Structure (target)

```
backend/app/
  api/routes/     # Thin route handlers
  core/           # Config, security, deps
  models/         # SQLAlchemy models
  schemas/        # Pydantic request/response
  services/       # Business logic
frontend/src/
  components/
  hooks/
  services/       # API client layer
  pages/
docker-compose.yml
personal/           # Gitignored local notes; never commit
```

## Rules That Never Break

- Scope all user data to the authenticated user.
- Never commit secrets, `.env` values, or credentials.
- `personal/` is local-only and gitignored.
- Implement ticket acceptance criteria; do not expand scope without asking.
- Prefer the smallest correct change; do not refactor unrelated code.
- Point to real file paths when referencing patterns (e.g. `backend/app/api/routes/sessions.py`).

## Naming

| Area | Convention |
|------|------------|
| Python files / functions | `snake_case` |
| Python classes | `PascalCase` |
| TypeScript components | `PascalCase` |
| TypeScript functions / variables | `camelCase` |
| API routes | `/api/v1/plural_nouns` (e.g. `/api/v1/sessions`) |
| DB tables | `snake_case`, plural (e.g. `breathing_patterns`) |

## General

- Match existing naming, structure, and error handling in the area you edit.
- Keep files focused; split when a module is hard to review.
- Comments only for non-obvious business logic.
- Add or update tests when behavior changes.

## Working Style

- Suggest and explain; the developer decides. Summarize changes and flag manual review items.
- Do not create git commits unless explicitly asked.
- Do not invent packages, endpoints, or types not verified in the codebase.
- One ticket, one concern at a time on non-trivial work.

## Error Handling

- **Backend:** domain errors in services; map to HTTP in routes. No bare `except:`.
- **Frontend:** user-visible errors on API failure; loading and empty states on data views.

## Do Not

- Add dependencies without explicit request.
- Remove or weaken tests to make something pass.
- Large cross-module refactors without explicit request.
- Change AWS/deployment config without explicit request.
- Paste or output `.env` or credential contents.

### Do Not Install (unless asked)

- **Frontend:** axios (use `fetch`), moment (use `Date` or `date-fns` if already present), extra UI kits.
- **Backend:** ORMs other than SQLAlchemy, alternate web frameworks, sync drivers outside the stack.

## Specialized Rules

Read these with the Read tool when the trigger applies — they are not auto-loaded.

| File | Read when… |
|------|------------|
| `.claude/rules/security.md` | Adding auth, routes, middleware, or anything reading/writing user data |
| `.claude/rules/database.md` | Editing models, queries, or Alembic migrations |
| `.claude/rules/infrastructure.md` | Editing Docker, Compose, CI, or AWS deployment config |
| `.claude/rules/ai-product.md` | Working on V3 LLM integration, prompts, or AI features |
| `.claude/rules/new-feature-checklist.md` | Implementing a GitHub Issue end to end, from ticket to PR |

`backend/CLAUDE.md` and `frontend/CLAUDE.md` load automatically when you work in those directories.

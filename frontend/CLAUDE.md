# Frontend Standards (React / TypeScript / Vite)

Applies to `frontend/**/*.{ts,tsx}`. See root `CLAUDE.md` for project-wide rules.

## Structure

| Layer | Location |
|-------|----------|
| Pages | `frontend/src/pages/` |
| Components | `frontend/src/components/` |
| Hooks | `frontend/src/hooks/` |
| API client | `frontend/src/services/` |

## Components

- Functional components with explicit TypeScript prop types.
- Every data-fetching view: **loading**, **error**, and **empty** states.

## API Integration

- HTTP calls only in `frontend/src/services/`. Type all responses.
- Follow the auth pattern in the codebase (httpOnly cookies vs tokens).

## UX

- Validate forms before submit; display server errors clearly.
- Semantic HTML, labels, keyboard focus on interactive elements.
- Core flows must work on mobile widths (login, dashboard, breathing).

## Do Not

- Add axios, moment, or new UI libraries without explicit request.
- Put `fetch` calls inside presentational components.
- Store tokens in `localStorage` if the project uses httpOnly cookies.

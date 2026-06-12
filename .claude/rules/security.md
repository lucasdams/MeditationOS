# Security

Read when adding routes, auth, middleware, or anything that reads or writes user data.

## Authentication

- Hash passwords with bcrypt or argon2. Never store or log plaintext.
- Follow the pattern in `backend/app/core/security.py` (httpOnly cookies or short-lived JWTs).
- All user-data routes require auth dependency; default deny.

## Authorization

- Sessions, journals, goals, breathing patterns: verify `user_id` matches the authenticated user.
- Return 404 (not 403) for other users' resource IDs when appropriate to avoid ID enumeration.

## Input & API

- Validate with Pydantic; reject unexpected fields.
- Rate-limit auth endpoints — login, register, Google, guest, password-reset,
  verification-resend (per-IP via `slowapi`). Plus a per-email login throttle
  (`app/core/login_guard.py`) against distributed brute force.
- Cap per-user, per-day creation of user data (sessions/gratitude/journals/goals) to
  resist spam — see `app/core/limits.py` (`DAILY_CREATE_LIMIT`) → `429` — and a per-IP
  write burst limit (`WRITE_RATE_LIMIT`).
- Only trust `X-Forwarded-For` for client IP behind a real proxy (`TRUST_PROXY`).
- Send standard security response headers on every response — see
  `app/core/security_headers.py` (nosniff, frame-deny, referrer/permissions policy,
  HSTS in production).
- CORS: known frontend origins only in production.

## Secrets

- `SECRET_KEY`, `DATABASE_URL`, LLM keys: environment variables only.
- Never commit `.env` or paste secrets into prompts or logs.

## New Route Checklist

- [ ] Auth required?
- [ ] Input validated?
- [ ] Scoped to current user?
- [ ] No secrets in response or logs?
- [ ] Correct status codes (401, 403, 404, 422)?

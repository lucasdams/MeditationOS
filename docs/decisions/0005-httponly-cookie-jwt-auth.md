# ADR-0005: httpOnly-cookie JWT authentication

**Status:** Accepted · 2026-06 · Detail: [authentication design](../design/authentication.md)

## Context

Auth is the most security-sensitive surface and the one most likely to be probed in an interview. The main decision is **where the token lives**, because that determines the dominant attack surface (XSS vs CSRF).

## Decision

Issue a **short-lived JWT (30 min) in an `HttpOnly; Secure; SameSite=Lax` cookie**. Passwords hashed with **argon2**. Refresh-token rotation is deferred to V1.5; V1 users re-login on expiry.

## Consequences

- JavaScript cannot read the token, so an XSS bug can't exfiltrate the session — the most damaging common failure mode is closed off.
- `SameSite=Lax` blocks the typical cross-site CSRF vector; if a future state-changing flow needs more, add a CSRF token.
- Stateless tokens mean **logout can't instantly revoke** a copied token — bounded by the 30-min TTL. Accepted for V1; the V1.5 refresh store adds real revocation.
- A single `get_current_user` dependency enforces default-deny on all protected routes.

## Alternatives considered

- **JWT in `localStorage`** — the popular tutorial pattern; rejected because any XSS can steal the token. Would undercut the project's security story.
- **Server-side sessions (Redis/DB)** — easiest revocation, but adds a session store and ops surface. Overkill for V1 scale; reconsider if instant global logout becomes a requirement.

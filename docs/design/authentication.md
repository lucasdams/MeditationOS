# Authentication Design

[← Back to README](../../README.md) · Related: [ADR-0005](../decisions/0005-httponly-cookie-jwt-auth.md)

## Decision

V1 uses a **short-lived JWT access token delivered in an httpOnly cookie**, not a token stored in `localStorage`.

| Property | Value |
|----------|-------|
| Token type | JWT (HS256), signed with `SECRET_KEY` |
| Transport | `Set-Cookie`, `HttpOnly; Secure; SameSite=Lax` |
| Access token TTL | 30 minutes |
| Refresh strategy | V1: re-login on expiry. V1.5: rotating refresh token (httpOnly cookie, hash stored in DB) |
| Password hashing | `argon2` (via `passlib`), per-password salt |

## Why this over the alternatives

| Option | Verdict | Reason |
|--------|---------|--------|
| **JWT in `localStorage`** | ✗ Rejected | Readable by any JS → XSS can exfiltrate the token. Common tutorial choice; a security reviewer flags it immediately. |
| **JWT in httpOnly cookie** | ✓ Chosen | JS cannot read it, so XSS can't steal it. `SameSite=Lax` blocks most CSRF; state-changing routes get an additional CSRF guard if needed. |
| **Server-side sessions (DB/Redis)** | ◐ Viable | Easiest revocation, but adds a session store and infra. Overkill for V1's scale; revisit if instant logout-everywhere becomes a requirement. |

The httpOnly-cookie choice is the one most likely to come up in an interview, and it lets me talk through the **XSS vs CSRF tradeoff** concretely rather than abstractly.

## Registration flow

```
POST /api/v1/auth/register  { email, password }
  → validate email format + password policy (Pydantic)
  → reject if email exists (409)
  → hash password with argon2
  → INSERT user
  → 201 { id, email, created_at }   (never returns password_hash)
```

## Login flow

```
POST /api/v1/auth/login  { email, password }
  → look up user by email
  → verify password against argon2 hash (constant-time)
  → on success: sign JWT { sub: user_id, exp: now+30m }
  → Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Lax
  → 200 { id, email }
  → on failure: 401 (generic "invalid credentials" — no user-enumeration hint)
```

## Authenticated request

```
Any protected route
  → read access_token cookie
  → verify signature + expiry
  → load user_id from `sub` claim → inject as request dependency
  → 401 if missing/invalid/expired
```

A single FastAPI dependency (`get_current_user`) enforces this. Routes are **default-deny**: a route is unauthenticated only if it explicitly opts out (register, login, health).

## Logout

```
POST /api/v1/auth/logout
  → Set-Cookie: access_token=; Max-Age=0   (clear it)
  → 204
```

Because V1 uses stateless JWTs, logout clears the cookie but the token stays valid until expiry if it was copied. The 30-minute TTL bounds that window. True server-side revocation arrives with the V1.5 refresh-token store.

## Hardening checklist (tracked against `.claude/rules/security.md`)

- [ ] `argon2` hashing; plaintext never stored or logged
- [ ] Login + register rate-limited (per-IP and per-email)
- [ ] Generic auth-failure messages (no account enumeration)
- [ ] `Secure` cookie flag enforced outside local dev
- [ ] CORS restricted to known origins; credentials allowed only for those
- [ ] `SECRET_KEY` from env; rotated on suspected compromise
- [ ] All user-data routes go through `get_current_user` and filter by `user_id`

## Deliberately deferred (post-V1)

- Refresh-token rotation + reuse detection
- Password reset via email token
- Email verification
- MFA / OAuth social login

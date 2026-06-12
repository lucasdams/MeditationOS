# Authentication Design

[← Back to README](../../README.md) · Related: [ADR-0005](../decisions/0005-httponly-cookie-jwt-auth.md)

## Decision

V1 uses a **short-lived JWT access token delivered in an httpOnly cookie**, not a token stored in `localStorage`.

| Property | Value |
|----------|-------|
| Token type | JWT (HS256), signed with `SECRET_KEY` |
| Transport | `Set-Cookie`, `HttpOnly; Secure; SameSite=Lax` |
| Access token TTL | 60 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`) |
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
  → on success: sign JWT { sub: user_id, exp: now+60m }
  → Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Lax
  → 200 { id, email }
  → on failure: 401 (generic "invalid credentials" — no user-enumeration hint)
```

## Sign in with Google ✅ implemented

```
POST /api/v1/auth/google  { credential }      (Google ID token from the GIS button)
  → verify the token against Google's keys: signature, aud == GOOGLE_CLIENT_ID,
    issuer, expiry (via the `google-auth` library), and email_verified
  → resolve the account:
      1. linked Google identity (users.google_sub == token.sub) → reuse
      2. same verified email already registered → link (set google_sub)
      3. otherwise → create a new, passwordless account
  → sign the SAME JWT + Set-Cookie as password login
  → 200 user · 401 if the token is invalid/unverified
```

We verify the **ID token** on the backend rather than running the redirect /
authorization-code flow, so there is **no client secret** to store — only the
public `GOOGLE_CLIENT_ID`. Google-only accounts have `password_hash = NULL`
(so `authenticate()` can never log into them with a password), and `google_sub`
(Google's stable subject id) is unique. Linking by **verified** email is safe
because Google asserts `email_verified`. Rate-limited like `/login`.

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

Because V1 uses stateless JWTs, logout clears the cookie but the token stays valid until expiry if it was copied. The 60-minute TTL bounds that window. True server-side revocation arrives with the V1.5 refresh-token store.

## Hardening checklist (tracked against `.claude/rules/security.md`)

- [x] `argon2` hashing; plaintext never stored or logged
- [x] Login + register + Google + guest + password-reset + verification-resend rate-limited (per-IP)
- [x] **Per-email login throttle** — lock an account's login after `LOGIN_MAX_FAILURES` failures within `LOGIN_FAILURE_WINDOW_MINUTES` → `429` (resists distributed brute force; see `app/core/login_guard.py`). _In-memory; move to a shared store (Redis) for multi-worker deploys._
- [x] Per-user **daily creation cap** on sessions / gratitude / journals / goals (`DAILY_CREATE_LIMIT`, default 200/UTC-day) → `429`, plus a per-IP burst limit on writes (`WRITE_RATE_LIMIT`, default 60/min)
- [x] **Security response headers** on every response — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and `Strict-Transport-Security` in production (see `app/core/security_headers.py`)
- [x] Rate limiting keys on the real client IP — socket peer by default, or the left-most `X-Forwarded-For` entry when `TRUST_PROXY=true` (only behind a trusted proxy)
- [x] Generic `401` on **login** failure; _registration still returns `409` (enumerable) — see tradeoffs below_
- [x] `Secure` cookie flag enforced outside local dev (`ENVIRONMENT=production`)
- [x] CORS restricted to configured origins; credentials allowed only for those
- [x] `SECRET_KEY` from env; the app **refuses to boot** in production with the default key
- [x] All user-data routes go through `get_current_user` and filter by `user_id`

## Known tradeoffs

- **Registration is enumerable.** `POST /auth/register` returns `409` for an
  already-registered email, which reveals that the address has an account —
  unlike login, which returns a generic `401`. Accepted for V1. Email verification
  now exists (below); a future hardening step can make registration respond
  generically and gate the account on the emailed confirmation instead of `409`.

## Deploy-time hardening (before AWS, Cycle 5)

- **Rate limiter client IP.** `slowapi` keys on the socket peer by default. Behind a
  reverse proxy / load balancer, set `TRUST_PROXY=true` so it keys on the left-most
  `X-Forwarded-For` entry instead of the proxy's IP. Only enable it when a trusted
  proxy actually sets that header (otherwise clients can spoof it).
- **Postgres driver.** `psycopg2-binary` is convenient for dev but discouraged
  for production; use the source build or psycopg3.
- **Google OAuth origins.** Add the production domain as an *Authorized JavaScript
  origin* on the Google OAuth client, and set `GOOGLE_CLIENT_ID` /
  `VITE_GOOGLE_CLIENT_ID` in the production environment. With `ENVIRONMENT=production`
  the session cookie is already issued `Secure` (HTTPS-only).

## Password reset ✅ implemented

Forgot-password runs over the [email channel](notifications.md). `POST
/auth/password/reset-request` always returns `202` (no enumeration) and emails a
link only to password accounts; `POST /auth/password/reset` completes it. The reset
token is a **signed, 30-minute JWT** carrying the user id plus a fingerprint of the
current password hash — so it's **single-use** (the reset itself changes the hash,
invalidating the link) with **no reset-token table**. Rate-limited like login. See
[api-v1](api-v1.md).

## Guest accounts ✅ implemented

"Use without signing up." `POST /auth/guest` creates an **anonymous** account — a
synthetic email (`guest_<hex>@guest.meditationos.app`), an auto-assigned username (so
the guest skips the username gate), no password, `is_guest = true`,
`email_verified = true` — and signs it in with the normal session cookie. The whole
app then works because every feature is already scoped to a `user_id`; the guest just
*is* a user. `POST /auth/claim { email, password }` converts the guest **in place**,
preserving all its data: it sets a real email + password, flips `is_guest` to false,
and triggers email verification. This reuses the existing model rather than a separate
local-only data path. `/auth/guest` is rate-limited like login.

## Email verification ✅ implemented

Registration emails a confirmation link over the [email channel](notifications.md);
`POST /auth/verify-email` confirms it and `POST /auth/verify-email/resend`
(authenticated, rate-limited) re-sends. The token is a **signed, 24-hour JWT**
carrying the user id and the issued-for address. **Sign in with Google** accounts
arrive verified (`email_verified` claim). Verification is **not enforced** in V1 —
unverified users see a reminder banner but keep full access (`users.email_verified`
tracks state). Enforcement (gating sensitive actions) can come later.

## Deliberately deferred (post-V1)

- Refresh-token rotation + reuse detection
- Enforcing verification (gate actions on `email_verified`)
- Other social providers / MFA (TOTP)

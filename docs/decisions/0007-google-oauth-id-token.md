# ADR-0007: Sign in with Google via ID-token verification

**Status:** Accepted · 2026-06 · Extends [ADR-0005](0005-httponly-cookie-jwt-auth.md) · Detail: [authentication design](../design/authentication.md#sign-in-with-google--implemented)

## Context

Email/password (ADR-0005) is the only way in. "Sign in with Google" lowers
signup friction and is a common interview talking point. Two questions drive the
design: **which OAuth flow**, and **how to reconcile a Google identity with an
existing account**.

## Decision

**Verify a Google ID token on the backend** rather than running the
authorization-code/redirect flow. The frontend uses Google Identity Services to
obtain an ID token (JWT) and POSTs it to `POST /api/v1/auth/google`; the backend
validates it against Google's public keys — signature, `aud == GOOGLE_CLIENT_ID`,
issuer, expiry, and `email_verified` — via the `google-auth` library, then issues
the **same httpOnly-cookie session** as password login (so ADR-0005 still governs
the session).

**Link by verified email.** Account resolution order: (1) an account already
linked to this Google identity (`users.google_sub`); (2) an existing account with
the same Google-verified email — link it; (3) otherwise a new, passwordless
account. `password_hash` becomes nullable; `authenticate()` rejects password
logins against Google-only accounts.

## Consequences

- **No client secret to store** — only the public `GOOGLE_CLIENT_ID`. One fewer
  production secret to manage and leak; no server-side redirect-URI dance.
- Linking by *verified* email is safe because Google asserts `email_verified`, so
  one person keeps one account and can use either sign-in method.
- The session, authorization, and `get_current_user` machinery are untouched —
  Google is purely a new way to *obtain* the existing cookie.
- The `google-auth` dependency is **lazily imported** inside the verifier, so it
  only loads when the feature is used and tests can patch verification (no network).
- Trades away the redirect flow's "zero Google JS on the frontend" property; the
  GIS script is loaded client-side. Acceptable for a browser SPA.

## Alternatives considered

- **Authorization-code / redirect flow** — the classic server-side OAuth flow.
  Rejected for V1: it requires storing a **client secret** and managing redirect
  URIs for more moving parts, with no benefit here since we only need
  authentication, not Google API access on the user's behalf.
- **Keep Google identities separate from password accounts** — refuse to link a
  Google sign-in to an existing email. Rejected: causes "I can't get into my
  account" confusion when the verified email is the same person.
- **A third-party auth provider (Auth0/Clerk/Firebase)** — faster to wire up, but
  outsources the most interesting security story and adds vendor lock-in/cost.
  Overkill for one provider at V1 scale.

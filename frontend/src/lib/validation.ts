// Shared client-side validation helpers so sibling auth forms (Login, Register)
// validate the same fields the same way. This is a friendly pre-check only — the
// backend remains the source of truth.

// Pragmatic email shape check: a non-empty local part, an @, and a dotted domain.
// Deliberately permissive (not RFC-exhaustive) to avoid rejecting valid addresses.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

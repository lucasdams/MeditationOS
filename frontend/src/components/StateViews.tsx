import type { ReactNode } from 'react'

/**
 * Tiny shared building blocks for a data view's loading / error / empty states,
 * so the same hand-rolled markup isn't repeated across pages. Behaviour is kept
 * identical to what they replace — these only standardize the markup that was
 * already showing a banner / line.
 */

// A quiet "Loading…" line. `label` overrides the default copy where a page used
// something more specific.
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p>{label}</p>
}

// An accessible error banner — the `<p role="alert" className="error">` that
// appeared across the app. Renders nothing when there's no message.
export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="error">
      {message}
    </p>
  )
}

// A muted empty-state line ("No … yet"). Accepts text or richer children.
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>
}

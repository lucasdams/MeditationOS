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
// `id` is optional: pass it when inputs need `aria-describedby` pointing here.
export function ErrorBanner({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null
  return (
    <p role="alert" id={id} className="error">
      {message}
    </p>
  )
}

// A muted empty-state line ("No … yet"). Accepts text or richer children.
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>
}

// A load-error banner with a "Try again" action, for data-fetching views where a
// failed read should offer to re-run rather than leaving a dead message. Renders
// nothing when there's no message. `onRetry` re-runs the fetch; `retrying` disables
// the button while the retry is in flight.
export function RetryableError({
  message,
  onRetry,
  retrying = false,
}: {
  message?: string | null
  onRetry: () => void
  retrying?: boolean
}) {
  if (!message) return null
  return (
    <div role="alert" className="error error-retry">
      <span>{message}</span>
      <button type="button" className="retry-btn" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  )
}

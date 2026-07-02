import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideProps } from 'lucide-react'

/**
 * Tiny shared building blocks for a data view's loading / error / empty states,
 * so the same hand-rolled markup isn't repeated across pages. Behaviour is kept
 * identical to what they replace — these only standardize the markup that was
 * already showing a banner / line.
 */

// A quiet "Loading…" line. `label` overrides the default copy where a page used
// something more specific; `className` lets a caller keep its existing placement
// (e.g. "centered" full-page, or "muted" inside a fallback).
export function Loading({ label = 'One moment…', className }: { label?: string; className?: string }) {
  return <p className={className}>{label}</p>
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
//
// Passing `icon` / `title` / a CTA promotes it to the richer, on-brand empty state:
// a soft-tinted lucide glyph, a warm one-liner heading, then the `children` as a
// calm sub-line, and an optional primary action that routes to whatever fills the
// view. With none of those, it stays the original quiet muted line — so existing
// callers keep their exact markup and behaviour.
export function EmptyState({
  children,
  icon: Icon,
  title,
  actionTo,
  actionLabel,
}: {
  children: ReactNode
  /** A lucide line-icon component (e.g. `BarChart3`); shown in a soft accent disc. */
  icon?: ComponentType<LucideProps>
  /** A warm, honest one-liner heading above the body copy. */
  title?: string
  /** Route the primary CTA links to (the action that fills this view). */
  actionTo?: string
  /** Label for the primary CTA. Requires `actionTo`. */
  actionLabel?: string
}) {
  // No enrichment → the original quiet line, unchanged.
  if (!Icon && !title && !(actionTo && actionLabel)) {
    return <p className="muted">{children}</p>
  }
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state-icon" aria-hidden="true">
          <Icon size={26} strokeWidth={1.5} />
        </span>
      )}
      {title && <p className="empty-state-title">{title}</p>}
      <p className="empty-state-body muted">{children}</p>
      {actionTo && actionLabel && (
        <Link to={actionTo} className="empty-state-action">
          {actionLabel}
        </Link>
      )}
    </div>
  )
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

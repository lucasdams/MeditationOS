import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Sentry } from '../lib/observability'
import { t } from '../i18n'

/**
 * Catches render-time errors anywhere below it and shows a friendly fallback
 * instead of a white screen. (React error boundaries must be class components.)
 *
 * When Sentry is configured (VITE_SENTRY_DSN set), the error is forwarded to
 * Sentry for monitoring.  With no DSN the import is a no-op stub.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Forward to Sentry if configured; falls back to console in dev/no-DSN.
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    console.error('Unhandled UI error:', error, info)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <main id="main-content" className="auth-card">
        <h1>{t('error.title')}</h1>
        <p className="muted">
          {t('error.body')}
        </p>
        <button type="button" onClick={() => window.location.assign('/')}>
          {t('error.reload')}
        </button>
      </main>
    )
  }
}

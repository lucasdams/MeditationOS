import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches render-time errors anywhere below it and shows a friendly fallback
 * instead of a white screen. (React error boundaries must be class components.)
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
    // Surface it for debugging; a real deploy would forward this to error tracking.
    console.error('Unhandled UI error:', error, info)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="auth-card">
        <h1>Something went wrong</h1>
        <p className="muted">
          An unexpected error broke this page. Reloading usually fixes it.
        </p>
        <button type="button" onClick={() => window.location.assign('/')}>
          Reload the app
        </button>
      </main>
    )
  }
}

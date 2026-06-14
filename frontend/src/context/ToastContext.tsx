import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// Lightweight, app-wide transient confirmations ("Saved", "Goal created", …).
// Toasts auto-dismiss; success is the common case, error is available for parity.
// A toast may carry one action (e.g. "Undo") — those linger longer so there's time
// to use them.
export type ToastKind = 'success' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
}

interface ToastValue {
  showToast: (message: string, kind?: ToastKind, action?: ToastAction) => void
}

const ToastContext = createContext<ToastValue | undefined>(undefined)

const DISMISS_MS = 3000
// Actionable toasts stay reachable longer; this also bounds the undo window for
// deferred deletes (see hooks/usePendingDelete).
export const ACTION_DISMISS_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success', action?: ToastAction) => {
      // A simple incrementing id — Date.now() is fine here but a counter avoids
      // collisions when two toasts fire in the same tick.
      const id = nextId++
      setToasts((prev) => [...prev, { id, message, kind, action }])
      window.setTimeout(() => dismiss(id), action ? ACTION_DISMISS_MS : DISMISS_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

let nextId = 1

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// Lightweight, app-wide transient confirmations ("Saved", "Goal created", …).
// Toasts auto-dismiss; success is the common case, error is available for parity.
export type ToastKind = 'success' | 'error'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastValue {
  showToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastValue | undefined>(undefined)

const DISMISS_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    // A simple incrementing id — Date.now() is fine here but a counter avoids
    // collisions when two toasts fire in the same tick.
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, kind }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, DISMISS_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.message}
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

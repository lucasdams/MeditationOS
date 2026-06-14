import { useEffect, useRef } from 'react'
import { ACTION_DISMISS_MS } from '../context/ToastContext'

// Deferred deletes with an undo window. The real API call fires only after the
// window elapses, so "Undo" cancels it with no server round-trip and the row never
// actually leaves the database. Any deletes still pending when the component
// unmounts are flushed, so navigating away honours the user's intent.
//
// Pages drive their own list state: optimistically remove on delete, restore on
// undo. This hook just owns the timers and the flush-on-unmount.
export function usePendingDelete(delayMs: number = ACTION_DISMISS_MS) {
  const pending = useRef(new Map<string, { timer: number; run: () => void }>())

  useEffect(
    () => () => {
      for (const { timer, run } of pending.current.values()) {
        window.clearTimeout(timer)
        run()
      }
      pending.current.clear()
    },
    [],
  )

  // Queue the real delete to run after the undo window.
  function schedule(id: string, run: () => void) {
    const existing = pending.current.get(id)
    if (existing) window.clearTimeout(existing.timer)
    const timer = window.setTimeout(() => {
      pending.current.delete(id)
      run()
    }, delayMs)
    pending.current.set(id, { timer, run })
  }

  // Cancel a queued delete (the undo). Returns true if one was actually waiting.
  function cancel(id: string): boolean {
    const entry = pending.current.get(id)
    if (!entry) return false
    window.clearTimeout(entry.timer)
    pending.current.delete(id)
    return true
  }

  return { schedule, cancel }
}

import { useToast } from '../context/ToastContext'
import { usePendingDelete } from './usePendingDelete'

// The five list pages (gratitude, schedule, journal, goals, timeline) all share the
// same delete gesture: optimistically remove the row now, queue the real API call for
// after the undo window, restore the row (to its original index) on undo, and restore +
// surface an error toast if the server delete fails. This hook bundles that flow on top
// of usePendingDelete so each page only supplies its list, its id-getter, the delete
// call, and its own toast copy.
//
// The page keeps owning its list state — we just drive setList. Restoring splices the
// item back at its original index (clamped), so order survives an undo even on a list
// that's been sorted.

interface UndoableDeleteMessages {
  // Shown immediately with the "Undo" action when a row is removed.
  success: string
  // Shown if the deferred server delete fails (the row is restored first).
  error: string
}

interface UndoableDeleteOptions<T> {
  list: T[] | null
  setList: (update: (prev: T[] | null) => T[] | null) => void
  getId: (item: T) => string
  // The real delete API call, fired only after the undo window elapses.
  remove: (id: string) => Promise<unknown>
  messages: UndoableDeleteMessages
  // Optional hook to clear any per-page state before removing (e.g. an open menu, error).
  onStart?: () => void
}

export function useUndoableDelete<T>({
  list,
  setList,
  getId,
  remove,
  messages,
  onStart,
}: UndoableDeleteOptions<T>) {
  const { showToast } = useToast()
  const { schedule, cancel } = usePendingDelete()

  return function deleteItem(id: string) {
    if (!list) return
    const index = list.findIndex((item) => getId(item) === id)
    if (index === -1) return
    const item = list[index]
    onStart?.()
    // Optimistically remove now; the real delete fires only after the undo window.
    setList((prev) => prev?.filter((it) => getId(it) !== id) ?? null)

    const restore = () =>
      setList((cur) => {
        if (!cur || cur.some((it) => getId(it) === id)) return cur
        const next = [...cur]
        next.splice(Math.min(index, next.length), 0, item)
        return next
      })

    schedule(id, () => {
      remove(id).catch(() => {
        restore()
        showToast(messages.error, 'error')
      })
    })
    showToast(messages.success, 'success', {
      label: 'Undo',
      onClick: () => {
        if (cancel(id)) restore()
      },
    })
  }
}

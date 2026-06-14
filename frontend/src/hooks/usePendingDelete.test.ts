import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePendingDelete } from './usePendingDelete'

describe('usePendingDelete', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires the delete only after the window elapses', () => {
    const run = vi.fn()
    const { result } = renderHook(() => usePendingDelete(1000))

    result.current.schedule('a', run)
    expect(run).not.toHaveBeenCalled() // still within the undo window

    vi.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancel (undo) prevents the delete and reports it was waiting', () => {
    const run = vi.fn()
    const { result } = renderHook(() => usePendingDelete(1000))

    result.current.schedule('a', run)
    expect(result.current.cancel('a')).toBe(true)

    vi.advanceTimersByTime(2000)
    expect(run).not.toHaveBeenCalled()
    // Cancelling an unknown / already-cancelled id reports nothing was waiting.
    expect(result.current.cancel('a')).toBe(false)
  })

  it('flushes still-pending deletes on unmount (intent is honoured)', () => {
    const run = vi.fn()
    const { result, unmount } = renderHook(() => usePendingDelete(1000))

    result.current.schedule('a', run)
    unmount() // navigate away before the window elapses
    expect(run).toHaveBeenCalledTimes(1)

    // The timer was cleared, so it doesn't fire a second time.
    vi.advanceTimersByTime(2000)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

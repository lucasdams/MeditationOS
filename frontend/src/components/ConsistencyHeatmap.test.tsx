import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import type { ConsistencyCalendar } from '../types'

const getConsistency = vi.fn()

vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getConsistency: (...a: unknown[]) => getConsistency(...a),
  },
}))

import ConsistencyHeatmap from './ConsistencyHeatmap'

// A tiny 2-week window so the grid is easy to reason about in the assertions.
const calendar = (days: ConsistencyCalendar['days']): ConsistencyCalendar => ({
  start: '2026-08-03', // a Monday
  end: '2026-08-12',
  days,
})

describe('ConsistencyHeatmap', () => {
  beforeEach(() => {
    getConsistency.mockReset()
  })
  afterEach(cleanup)

  it('renders shaded cells from the fetched data', async () => {
    getConsistency.mockResolvedValue(
      calendar([
        { date: '2026-08-05', minutes: 3, sessions: 1 }, // lvl-1 (short)
        { date: '2026-08-10', minutes: 45, sessions: 2 }, // lvl-4 (deep)
      ]),
    )
    const { container } = render(<ConsistencyHeatmap />)

    await waitFor(() => expect(screen.getByText(/your consistency/i)).toBeInTheDocument())
    // The two practiced days are shaded at their intensity levels…
    expect(container.querySelector('.consistency-cell.lvl-1')).not.toBeNull()
    expect(container.querySelector('.consistency-cell.lvl-4')).not.toBeNull()
    // …and carry accessible per-day labels.
    expect(
      screen.getByRole('img', { name: /3 min on 2026-08-05/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /45 min on 2026-08-10/i }),
    ).toBeInTheDocument()
    // Legend summarises the total practice.
    expect(screen.getByText(/2 days in the last 12 weeks/i)).toBeInTheDocument()
  })

  it('shows a calm empty state when there is no practice', async () => {
    getConsistency.mockResolvedValue(calendar([]))
    const { container } = render(<ConsistencyHeatmap />)

    await waitFor(() =>
      expect(screen.getByText(/no practice in the last 12 weeks/i)).toBeInTheDocument(),
    )
    // No shaded cells at all in the empty state.
    expect(container.querySelector('.consistency-cell')).toBeNull()
  })

  it('renders nothing on a fetch failure (quiet, non-blocking)', async () => {
    getConsistency.mockRejectedValue(new Error('boom'))
    const { container } = render(<ConsistencyHeatmap />)
    await waitFor(() => expect(getConsistency).toHaveBeenCalled())
    await waitFor(() =>
      expect(container.querySelector('.consistency')).toBeNull(),
    )
  })
})

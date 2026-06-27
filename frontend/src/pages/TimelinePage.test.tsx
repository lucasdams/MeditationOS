/**
 * Display coverage for TimelinePage's session rows: a session's captured
 * intention and focus/calm self-ratings render when present, and are absent
 * when the session carries none. The other timeline sources are mocked empty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '../types'

const mockSessionList = vi.fn()

vi.mock('../services/sessions', () => ({
  sessionService: {
    list: (...a: unknown[]) => mockSessionList(...a),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('../services/journals', () => ({ journalService: { list: vi.fn(() => Promise.resolve([])) } }))
vi.mock('../services/gratitude', () => ({ gratitudeService: { list: vi.fn(() => Promise.resolve([])) } }))
vi.mock('../services/moodLogs', () => ({ moodLogService: { list: vi.fn(() => Promise.resolve([])), remove: vi.fn() } }))
vi.mock('../context/ToastContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/ToastContext')>()
  return { ...actual, useToast: () => ({ showToast: vi.fn() }) }
})

import TimelinePage from './TimelinePage'

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 's1',
    type: 'mindfulness',
    duration_seconds: 600,
    occurred_at: '2026-06-26T10:00:00Z',
    notes: null,
    focus: null,
    calm: null,
    inhale_seconds: null,
    exhale_seconds: null,
    cycles_completed: null,
    breaths_per_minute: null,
    intention: null,
    created_at: '2026-06-26T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TimelinePage />
    </MemoryRouter>,
  )
}

describe('TimelinePage — session intention + ratings display', () => {
  beforeEach(() => mockSessionList.mockReset())
  afterEach(cleanup)

  it('shows the intention and focus/calm read-out when the session has them', async () => {
    mockSessionList.mockResolvedValue([
      makeSession({ intention: 'Return to the breath.', focus: 4, calm: 3 }),
    ])
    renderPage()

    expect(await screen.findByText(/return to the breath/i)).toBeInTheDocument()
    expect(screen.getByText(/focus 4\/5/i)).toBeInTheDocument()
    expect(screen.getByText(/calm 3\/5/i)).toBeInTheDocument()
  })

  it('shows nothing extra when the session has no intention or ratings', async () => {
    mockSessionList.mockResolvedValue([makeSession({})])
    renderPage()

    // The session row renders (its type label), but no intention / rating read-out.
    await waitFor(() => expect(mockSessionList).toHaveBeenCalled())
    await screen.findByText(/min/i)
    expect(screen.queryByText(/focus \d\/5/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/calm \d\/5/i)).not.toBeInTheDocument()
  })

  it('shows only the rating that is set (focus present, calm absent)', async () => {
    mockSessionList.mockResolvedValue([makeSession({ focus: 5, calm: null })])
    renderPage()

    expect(await screen.findByText(/focus 5\/5/i)).toBeInTheDocument()
    expect(screen.queryByText(/calm \d\/5/i)).not.toBeInTheDocument()
  })
})

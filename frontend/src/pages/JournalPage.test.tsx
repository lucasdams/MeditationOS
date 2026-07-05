/**
 * Smoke tests for the JournalPage's contextual prompt nudge: it surfaces the
 * backend's recent-activity-tuned prompt, and falls back to a local daily prompt
 * if that fetch fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listJournals = vi.fn()
const promptJournal = vi.fn()
const listSessions = vi.fn()

vi.mock('../services/journals', () => ({
  journalService: {
    list: (...a: unknown[]) => listJournals(...a),
    prompt: (...a: unknown[]) => promptJournal(...a),
    random: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('../services/sessions', () => ({
  sessionService: { list: (...a: unknown[]) => listSessions(...a) },
}))
vi.mock('../services/gratitude', () => ({
  gratitudeService: { random: vi.fn() },
}))
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: vi.fn().mockResolvedValue({ xp: 0 }) },
}))
vi.mock('../components/RewardOverlay', () => ({ default: () => null }))
// Partially mock the toast context: keep its real exports (e.g. ACTION_DISMISS_MS,
// used by the undo-delete hook) and only stub the hook.
vi.mock('../context/ToastContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/ToastContext')>()
  return { ...actual, useToast: () => ({ showToast: vi.fn() }) }
})

import JournalPage from './JournalPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listJournals.mockReset().mockResolvedValue([])
  listSessions.mockReset().mockResolvedValue([])
  promptJournal.mockReset()
})
afterEach(cleanup)

describe('JournalPage — contextual prompt', () => {
  it('surfaces the backend contextual prompt once it loads', async () => {
    promptJournal.mockResolvedValue({
      text: 'How does your body feel now, after breathing?',
      context: 'after_breathing',
      contextual: true,
    })

    renderPage()

    expect(
      await screen.findByRole('button', {
        name: /How does your body feel now, after breathing\?/i,
      }),
    ).toBeInTheDocument()
    expect(promptJournal).toHaveBeenCalled()
  })

  it('falls back to a local daily prompt when the contextual fetch fails', async () => {
    promptJournal.mockRejectedValue(new Error('boom'))

    renderPage()

    // The prompt still renders (the local daily prompt) — the "Writing prompt" label is
    // always present when a prompt is shown, and the shuffle affordance is available.
    expect(await screen.findByText(/writing prompt/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /show another prompt/i }),
      ).toBeInTheDocument(),
    )
  })
})

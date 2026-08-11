/**
 * Smoke tests for the JournalPage's contextual prompt nudge: it surfaces the
 * backend's recent-activity-tuned prompt, and falls back to a local daily prompt
 * if that fetch fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listJournals = vi.fn()
const promptJournal = vi.fn()
const listSessions = vi.fn()
const reflectJournal = vi.fn()

vi.mock('../services/journals', () => ({
  journalService: {
    list: (...a: unknown[]) => listJournals(...a),
    prompt: (...a: unknown[]) => promptJournal(...a),
    random: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reflect: (...a: unknown[]) => reflectJournal(...a),
    getReflection: vi.fn(),
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
import { ApiError } from '../services/api'

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
  promptJournal.mockReset().mockResolvedValue({ text: 'p', context: 'generic', contextual: false })
  reflectJournal.mockReset()
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
    promptJournal.mockReset().mockRejectedValue(new Error('boom'))

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

describe('JournalPage — AI reflection', () => {
  const ENTRY = {
    id: 'j1',
    body: 'Felt calmer after sitting today.',
    mood: 'calm',
    session_id: null,
    created_at: '2026-08-12T08:00:00Z',
  }
  const REFLECTION = {
    id: 'r1',
    journal_id: 'j1',
    reflection_text: 'You noticed a real shift toward calm today.',
    followup_question: 'What helped you settle, do you think?',
    source: 'ai',
    created_at: '2026-08-12T08:05:00Z',
  }

  async function tapReflect() {
    renderPage()
    const btn = await screen.findByRole('button', {
      name: /get a gentle reflection on this entry/i,
    })
    fireEvent.click(btn)
    return btn
  }

  beforeEach(() => {
    listJournals.mockResolvedValue([ENTRY])
  })

  it('tapping Reflect shows the reflection and follow-up as a quiet card', async () => {
    reflectJournal.mockResolvedValue(REFLECTION)

    await tapReflect()

    expect(
      await screen.findByText('You noticed a real shift toward calm today.'),
    ).toBeInTheDocument()
    expect(screen.getByText('What helped you settle, do you think?')).toBeInTheDocument()
    expect(screen.getByText(/a gentle reflection/i)).toBeInTheDocument()
    expect(reflectJournal).toHaveBeenCalledWith('j1')
    // The affordance is replaced by the card once the reflection is shown.
    expect(
      screen.queryByRole('button', { name: /get a gentle reflection on this entry/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a friendly note and disables Reflect when the daily cap is hit (429)', async () => {
    reflectJournal.mockRejectedValue(new ApiError(429, 'Daily limit reached.'))

    const btn = await tapReflect()

    expect(
      await screen.findByText(/all the reflections for today/i),
    ).toBeInTheDocument()
    expect(btn).toBeDisabled()
  })

  it('shows a gentle error and keeps the button as the retry on failure', async () => {
    reflectJournal.mockRejectedValueOnce(new ApiError(500)).mockResolvedValueOnce(REFLECTION)

    const btn = await tapReflect()

    expect(
      await screen.findByText(/couldn't reflect on this entry/i),
    ).toBeInTheDocument()
    expect(btn).toBeEnabled()

    fireEvent.click(btn)
    expect(
      await screen.findByText('You noticed a real shift toward calm today.'),
    ).toBeInTheDocument()
  })
})

/**
 * Smoke tests for the PrayerPage: empty state, list rendering, create (shows the new
 * entry + XP reward), inline edit, delete, and the mark-answered toggle. Mirrors the
 * JournalPage test style — the prayer service is fully mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listPrayers = vi.fn()
const createPrayer = vi.fn()
const updatePrayer = vi.fn()
const removePrayer = vi.fn()

vi.mock('../services/prayers', () => ({
  prayerService: {
    list: (...a: unknown[]) => listPrayers(...a),
    create: (...a: unknown[]) => createPrayer(...a),
    update: (...a: unknown[]) => updatePrayer(...a),
    remove: (...a: unknown[]) => removePrayer(...a),
  },
}))
vi.mock('../services/dashboard', () => ({
  dashboardService: { getStats: vi.fn().mockResolvedValue({ xp: 0, daily_quests: [], streak_bonus_xp: 0 }) },
}))
vi.mock('../components/RewardOverlay', () => ({ default: () => null }))
// Partially mock the toast context: keep its real exports (ACTION_DISMISS_MS, used by
// the undo-delete hook) and only stub the hook.
vi.mock('../context/ToastContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/ToastContext')>()
  return { ...actual, useToast: () => ({ showToast: vi.fn() }) }
})

import PrayerPage from './PrayerPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrayerPage />
    </MemoryRouter>,
  )
}

const OPEN = {
  id: 'p1',
  body: 'May this day bring peace.',
  answered_at: null,
  created_at: '2026-08-12T08:00:00Z',
}
const ANSWERED = {
  id: 'p2',
  body: 'A hope that came true.',
  answered_at: '2026-08-12T09:00:00Z',
  created_at: '2026-08-10T08:00:00Z',
}

beforeEach(() => {
  listPrayers.mockReset().mockResolvedValue([])
  createPrayer.mockReset()
  updatePrayer.mockReset()
  removePrayer.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('PrayerPage', () => {
  it('shows the empty state when there are no prayers', async () => {
    renderPage()
    expect(await screen.findByText(/your first prayer goes up top/i)).toBeInTheDocument()
  })

  it('renders past prayers, offering the right toggle per answered state', async () => {
    listPrayers.mockResolvedValue([OPEN, ANSWERED])
    renderPage()

    expect(await screen.findByText('May this day bring peace.')).toBeInTheDocument()
    expect(screen.getByText('A hope that came true.')).toBeInTheDocument()
    // An open prayer offers "Mark as answered"; an answered one offers "Reopen" — the
    // toggle label is the unambiguous signal of each entry's answered state.
    expect(screen.getByRole('button', { name: /mark as answered/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reopen/i })).toBeInTheDocument()
  })

  it('creating a prayer prepends the new entry', async () => {
    const created = {
      id: 'p3',
      body: 'A new intention.',
      answered_at: null,
      created_at: '2026-08-12T10:00:00Z',
    }
    createPrayer.mockResolvedValue(created)
    renderPage()
    await screen.findByLabelText(/prayer, intention, or blessing/i)

    const textarea = screen.getByLabelText(/prayer, intention, or blessing/i)
    fireEvent.change(textarea, { target: { value: 'A new intention.' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(createPrayer).toHaveBeenCalledWith({ body: 'A new intention.' }))
    expect(await screen.findByText('A new intention.')).toBeInTheDocument()
  })

  it('editing a prayer saves the new body', async () => {
    listPrayers.mockResolvedValue([OPEN])
    updatePrayer.mockResolvedValue({ ...OPEN, body: 'Edited prayer.' })
    renderPage()
    await screen.findByText('May this day bring peace.')

    // Open the ⋯ menu, then Edit.
    fireEvent.click(screen.getByRole('button', { name: /prayer actions/i }))
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))

    const editArea = screen.getByLabelText(/edit prayer/i)
    fireEvent.change(editArea, { target: { value: 'Edited prayer.' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // Await the async save (flush its microtask) before asserting the re-render.
    await waitFor(() =>
      expect(updatePrayer).toHaveBeenCalledWith('p1', { body: 'Edited prayer.' }),
    )
    expect(await screen.findByText('Edited prayer.')).toBeInTheDocument()
  })

  it('marking a prayer answered calls update with answered:true', async () => {
    listPrayers.mockResolvedValue([OPEN])
    updatePrayer.mockResolvedValue({ ...OPEN, answered_at: '2026-08-12T11:00:00Z' })
    renderPage()
    await screen.findByText('May this day bring peace.')

    fireEvent.click(screen.getByRole('button', { name: /mark as answered/i }))

    await waitFor(() => expect(updatePrayer).toHaveBeenCalledWith('p1', { answered: true }))
    // Under the "All" filter the entry stays and now offers "Reopen" instead.
    expect(await screen.findByRole('button', { name: /reopen/i })).toBeInTheDocument()
  })

  it('reopening an answered prayer calls update with answered:false', async () => {
    listPrayers.mockResolvedValue([ANSWERED])
    updatePrayer.mockResolvedValue({ ...ANSWERED, answered_at: null })
    renderPage()
    await screen.findByText('A hope that came true.')

    fireEvent.click(screen.getByRole('button', { name: /reopen/i }))

    await waitFor(() => expect(updatePrayer).toHaveBeenCalledWith('p2', { answered: false }))
  })

  it('deleting a prayer removes it from the list', async () => {
    listPrayers.mockResolvedValue([OPEN])
    renderPage()
    await screen.findByText('May this day bring peace.')

    fireEvent.click(screen.getByRole('button', { name: /prayer actions/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() =>
      expect(screen.queryByText('May this day bring peace.')).not.toBeInTheDocument(),
    )
  })

  it('surfaces a load error with a retry', async () => {
    listPrayers.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([OPEN])
    renderPage()

    expect(await screen.findByText(/couldn't load your prayers/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    expect(await screen.findByText('May this day bring peace.')).toBeInTheDocument()
  })
})

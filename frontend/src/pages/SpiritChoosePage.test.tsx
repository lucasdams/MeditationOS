import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SpiritState } from '../types'

const get = vi.fn()
const choose = vi.fn()
vi.mock('../services/spirit', () => ({
  spiritService: {
    get: (...a: unknown[]) => get(...a),
    choose: (...a: unknown[]) => choose(...a),
  },
}))

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

import SpiritChoosePage from './SpiritChoosePage'
import { ToastProvider } from '../context/ToastContext'

const need = { tier: 'content' as const, factor: 0.8 }
function spiritWith(overrides: Partial<SpiritState> = {}): SpiritState {
  return {
    stage: 'spark',
    path: null,
    name: null,
    bond: { level: 1, xp_into_level: 0, xp_for_next: 20 },
    needs: { nourished: need, rested: need, joyful: need },
    condition: need,
    coins: 80,
    cosmetics: {},
    available: [],
    collection: [],
    ...overrides,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <SpiritChoosePage />
      </ToastProvider>
    </MemoryRouter>,
  )

describe('SpiritChoosePage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    get.mockReset()
    choose.mockReset()
    navigate.mockReset()
  })

  it('shows the three dosha choices for a pathless spark', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    await screen.findByRole('button', { name: /Choose Kapha/ })
    expect(screen.getByRole('button', { name: /Choose Pitta/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose Vata/ })).toBeInTheDocument()
  })

  it('names the creature AFTER choosing it; awaken is disabled until named (ADR-0024)', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    renderPage()
    // Step 1: picking a creature needs no name — it advances to the naming step.
    fireEvent.click(await screen.findByRole('button', { name: /Choose Pitta/ }))
    // Step 2: the name step appears; awaken is disabled until a non-empty name is entered.
    const awaken = screen.getByRole('button', { name: /Awaken Pitta/ })
    expect(awaken).toBeDisabled()
    expect(choose).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText(/Ember/), { target: { value: 'Ember' } })
    expect(awaken).not.toBeDisabled()
  })

  it('awakens the chosen creature with the entered name and navigates to /spirit', async () => {
    get.mockResolvedValue(spiritWith({ path: null }))
    choose.mockResolvedValue(spiritWith({ path: 'breath', name: 'Ember' }))
    renderPage()
    // Step 1: choose the creature; step 2: name it (trimmed) and awaken → choose sends {path, name}.
    fireEvent.click(await screen.findByRole('button', { name: /Choose Pitta/ }))
    fireEvent.change(screen.getByPlaceholderText(/Ember/), { target: { value: '  Ember  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Awaken Pitta/ }))
    await waitFor(() =>
      expect(choose).toHaveBeenCalledWith({ path: 'breath', name: 'Ember' }),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/spirit'))
  })

  it('redirects to /spirit when a creature is already chosen (nothing to pick)', async () => {
    get.mockResolvedValue(spiritWith({ path: 'stillness' }))
    renderPage()
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Choose Kapha/ })).toBeNull()
  })
})

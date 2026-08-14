/**
 * Smoke tests for the PhilosophersPage: the picker renders the roster, sending a message
 * shows the guide's reply, and the guest (403) / daily-cap (429) gates surface a gentle
 * note and disable further sends. The service is mocked; ApiError is the real class so
 * status-based branching is exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listPersonas = vi.fn()
const chatPersona = vi.fn()
const getStats = vi.fn()

vi.mock('../services/philosophers', () => ({
  philosopherService: {
    list: (...a: unknown[]) => listPersonas(...a),
    chat: (...a: unknown[]) => chatPersona(...a),
  },
}))

vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getStats: (...a: unknown[]) => getStats(...a),
  },
}))

import PhilosophersPage from './PhilosophersPage'
import { ApiError } from '../services/api'

const ROSTER = [
  {
    id: 'marcus-aurelius',
    name: 'Marcus Aurelius',
    tradition: 'Stoicism',
    blurb: 'A Stoic voice.',
    openers: ['What is mine to do today?', 'Something is out of my control.'],
  },
  { id: 'buddha', name: 'Buddha', tradition: 'Buddhism', blurb: 'A gentle voice.', openers: ['I am clinging.'] },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <PhilosophersPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listPersonas.mockReset().mockResolvedValue(ROSTER)
  chatPersona.mockReset()
  // Default: no practice today, so only the persona's own openers show.
  getStats.mockReset().mockResolvedValue({ today_minutes: 0 })
})

afterEach(cleanup)

async function openChat(name = 'Marcus Aurelius') {
  renderPage()
  await screen.findByText('Choose a guide')
  fireEvent.click(screen.getByLabelText(`Chat with ${name}`))
}

describe('PhilosophersPage', () => {
  it('renders the roster in the picker', async () => {
    renderPage()
    await screen.findByText('Choose a guide')
    expect(screen.getByText('Marcus Aurelius')).toBeInTheDocument()
    expect(screen.getByText('Buddha')).toBeInTheDocument()
    expect(screen.getByText('A Stoic voice.')).toBeInTheDocument()
  })

  it('shows a load error with retry when the roster fetch fails', async () => {
    listPersonas.mockRejectedValueOnce(new Error('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('sends a message and shows the reply', async () => {
    chatPersona.mockResolvedValue({ reply: 'What is in your control?', source: 'ai' })
    await openChat()

    const box = screen.getByLabelText('Your message')
    fireEvent.change(box, { target: { value: 'I feel restless.' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    expect(await screen.findByText('What is in your control?')).toBeInTheDocument()
    expect(screen.getByText('I feel restless.')).toBeInTheDocument()
    // The full history (the new user turn) is sent to the chosen persona.
    expect(chatPersona).toHaveBeenCalledWith('marcus-aurelius', [
      { role: 'user', content: 'I feel restless.' },
    ])
  })

  it('offers the persona openers on an empty chat and fills the composer when tapped', async () => {
    await openChat()
    const chip = await screen.findByRole('button', { name: 'Start with: What is mine to do today?' })
    fireEvent.click(chip)
    const box = screen.getByLabelText('Your message') as HTMLTextAreaElement
    expect(box.value).toBe('What is mine to do today?')
    // Tapping fills the composer but never auto-sends.
    expect(chatPersona).not.toHaveBeenCalled()
  })

  it('adds a personalized opener seeded with today’s practice', async () => {
    getStats.mockResolvedValue({ today_minutes: 12 })
    await openChat()
    const seeded = await screen.findByRole('button', { name: /Start with: I sat for 12 minutes today/ })
    fireEvent.click(seeded)
    const box = screen.getByLabelText('Your message') as HTMLTextAreaElement
    expect(box.value).toContain('I sat for 12 minutes today')
  })

  it('surfaces the guest note and disables the composer on 403', async () => {
    chatPersona.mockRejectedValue(new ApiError(403, 'Save your account'))
    await openChat()

    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await screen.findByText('Save your account to chat with a guide.')
    expect(screen.getByLabelText('Your message')).toBeDisabled()
  })

  it('surfaces the daily-cap note and disables the composer on 429', async () => {
    chatPersona.mockRejectedValue(new ApiError(429, 'Daily limit reached'))
    await openChat()

    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await screen.findByText('That’s enough reflection for today. Come back tomorrow.')
    expect(screen.getByLabelText('Your message')).toBeDisabled()
  })

  it('restores the draft and shows a retry note on a generic failure', async () => {
    chatPersona.mockRejectedValue(new ApiError(500, 'boom'))
    await openChat()

    const box = screen.getByLabelText('Your message') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'still here' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await screen.findByText('That didn’t go through. Try again.')
    await waitFor(() => expect(box.value).toBe('still here'))
    expect(box).not.toBeDisabled()
  })
})

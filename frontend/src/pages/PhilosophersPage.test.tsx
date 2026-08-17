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
const listConversations = vi.fn()
const getConversation = vi.fn()
const deleteConversation = vi.fn()
const getStats = vi.fn()

vi.mock('../services/philosophers', () => ({
  philosopherService: {
    list: (...a: unknown[]) => listPersonas(...a),
    chat: (...a: unknown[]) => chatPersona(...a),
    listConversations: (...a: unknown[]) => listConversations(...a),
    getConversation: (...a: unknown[]) => getConversation(...a),
    deleteConversation: (...a: unknown[]) => deleteConversation(...a),
  },
}))

vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getStats: (...a: unknown[]) => getStats(...a),
  },
}))

const useAuthMock = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => useAuthMock() }))

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

function renderPageAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PhilosophersPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listPersonas.mockReset().mockResolvedValue(ROSTER)
  chatPersona.mockReset()
  // Default: no saved conversations, so the picker shows just the roster.
  listConversations.mockReset().mockResolvedValue([])
  getConversation.mockReset()
  deleteConversation.mockReset().mockResolvedValue(undefined)
  // Default: no practice today, so only the persona's own openers show.
  getStats.mockReset().mockResolvedValue({ today_minutes: 0 })
  // Default: a saved (non-guest) account.
  useAuthMock.mockReset().mockReturnValue({ user: { is_guest: false } })
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

  it('deep-links straight into a guide via ?guide=', async () => {
    // The dashboard "reflect with a guide" card links to /philosophers?guide=<id>.
    renderPageAt('/philosophers?guide=buddha')
    // Lands in the chat view for that guide (composer present), skipping the picker.
    expect(await screen.findByLabelText('Your message')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Buddha')
  })

  it('offers a guide-suggested practice that deep-links back into the app', async () => {
    await openChat() // Marcus Aurelius
    const practice = await screen.findByRole('link', { name: /Focused attention/ })
    expect(practice).toHaveAttribute('href', '/meditate/focus')
  })

  it('shows a load error with retry when the roster fetch fails', async () => {
    listPersonas.mockRejectedValueOnce(new Error('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('sends a message and shows the reply', async () => {
    chatPersona.mockResolvedValue({ reply: 'What is in your control?', source: 'ai', chat_id: 'c1' })
    await openChat()

    const box = screen.getByLabelText('Your message')
    fireEvent.change(box, { target: { value: 'I feel restless.' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    expect(await screen.findByText('What is in your control?')).toBeInTheDocument()
    expect(screen.getByText('I feel restless.')).toBeInTheDocument()
    // The full history (the new user turn) is sent to the chosen persona; no chat_id yet on
    // the first send (a fresh conversation); the UI locale rides along.
    expect(chatPersona).toHaveBeenCalledWith(
      'marcus-aurelius',
      [{ role: 'user', content: 'I feel restless.' }],
      undefined,
      'en',
    )
  })

  it('threads follow-up turns onto the saved conversation from the first reply', async () => {
    chatPersona.mockResolvedValue({ reply: 'Reply one.', source: 'ai', chat_id: 'chat-123' })
    await openChat()
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'first' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))
    await screen.findByText('Reply one.')
    // The second send carries the chat_id returned by the first reply.
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))
    await waitFor(() => expect(chatPersona).toHaveBeenCalledTimes(2))
    expect(chatPersona).toHaveBeenLastCalledWith(
      'marcus-aurelius',
      expect.arrayContaining([{ role: 'user', content: 'second' }]),
      'chat-123',
      'en',
    )
  })

  it('lists saved conversations and reopens one with its stored turns', async () => {
    listConversations.mockResolvedValue([
      { id: 'c1', philosopher_id: 'buddha', title: 'I am clinging.', updated_at: '2026-08-16T00:00:00Z' },
    ])
    getConversation.mockResolvedValue({
      id: 'c1',
      philosopher_id: 'buddha',
      title: 'I am clinging.',
      messages: [
        { role: 'user', content: 'I am clinging.' },
        { role: 'assistant', content: 'Notice the grasping, gently.' },
      ],
      created_at: '2026-08-16T00:00:00Z',
      updated_at: '2026-08-16T00:00:00Z',
    })
    renderPage()
    await screen.findByText('Your conversations')
    fireEvent.click(screen.getByText('I am clinging.'))
    expect(await screen.findByText('Notice the grasping, gently.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Buddha')
    expect(getConversation).toHaveBeenCalledWith('c1')
  })

  it('deletes a saved conversation', async () => {
    listConversations.mockResolvedValue([
      { id: 'c1', philosopher_id: 'buddha', title: 'I am clinging.', updated_at: '2026-08-16T00:00:00Z' },
    ])
    renderPage()
    await screen.findByText('Your conversations')
    fireEvent.click(screen.getByRole('button', { name: /Delete conversation/ }))
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(screen.queryByText('I am clinging.')).toBeNull())
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

  it('treats a 403 as a neutral note, not the guest wall (guests hit 429, not 403)', async () => {
    // The only 403 this endpoint returns is the email-verification gate; the global
    // auth:forbidden handler surfaces that app-wide. Locally we show a neutral note and
    // never the wrong "save your account" guest copy, and don't hard-block the composer.
    chatPersona.mockRejectedValue(new ApiError(403, 'Verify your email'))
    await openChat()

    const box = screen.getByLabelText('Your message') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    await screen.findByText('That didn’t go through. Try again.')
    expect(screen.queryByText('Save your account to chat with a guide.')).toBeNull()
    expect(box).not.toBeDisabled()
  })

  it('shows a guest a gentle heads-up with a sign-up link (no upfront wall)', async () => {
    useAuthMock.mockReturnValue({ user: { is_guest: true } })
    await openChat()
    // The composer is usable (guests get a trial), and a quiet note points to signing up.
    expect(screen.getByLabelText('Your message')).not.toBeDisabled()
    expect(screen.getByText(/reflecting as a guest/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a free account' })).toHaveAttribute(
      'href',
      '/register',
    )
  })

  it('nudges a guest toward an account when the trial cap is hit (429)', async () => {
    useAuthMock.mockReturnValue({ user: { is_guest: true } })
    chatPersona.mockRejectedValue(new ApiError(429, 'Guest limit'))
    await openChat()
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))
    await screen.findByText(/guest limit for today/i)
    expect(screen.getByRole('link', { name: 'Create a free account' })).toHaveAttribute(
      'href',
      '/register',
    )
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

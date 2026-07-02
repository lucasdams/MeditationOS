import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const submit = vi.fn()
vi.mock('../services/feedback', () => ({
  feedbackService: { submit: (...a: unknown[]) => submit(...a) },
}))

import FeedbackButton from './FeedbackButton'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open() {
  render(<FeedbackButton />)
  fireEvent.click(screen.getByRole('button', { name: /send feedback/i }))
}

describe('FeedbackButton', () => {
  it('opens the modal with a category select + message field', () => {
    open()
    expect(screen.getByLabelText(/what kind of note/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/your message/i)).toBeInTheDocument()
  })

  it('keeps Send disabled until a message is typed', () => {
    open()
    const send = screen.getByRole('button', { name: /^send$/i })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/your message/i), { target: { value: 'hi there' } })
    expect(send).toBeEnabled()
  })

  it('submits the note (category + trimmed message + path) and confirms', async () => {
    submit.mockResolvedValue({ id: '1' })
    open()
    fireEvent.change(screen.getByLabelText(/what kind of note/i), { target: { value: 'bug' } })
    fireEvent.change(screen.getByLabelText(/your message/i), { target: { value: '  broken  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0][0]).toMatchObject({ category: 'bug', message: 'broken' })
    expect(await screen.findByText(/on its way/i)).toBeInTheDocument()
  })

  it('shows an error when the submit fails', async () => {
    submit.mockRejectedValue(new Error('nope'))
    open()
    fireEvent.change(screen.getByLabelText(/your message/i), { target: { value: 'idea' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

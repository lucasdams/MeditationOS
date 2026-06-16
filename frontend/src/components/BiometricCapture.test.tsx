import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockCreate = vi.fn()
vi.mock('../services/biometrics', () => ({
  biometricsService: { create: (...a: unknown[]) => mockCreate(...a) },
}))

import BiometricCapture from './BiometricCapture'

describe('BiometricCapture', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ id: 'r1' })
  })
  afterEach(cleanup)

  function renderPrompt(onDone = vi.fn(), onSkip = vi.fn()) {
    render(
      <BiometricCapture
        context="post"
        sessionId="s1"
        title="Log a quick reading?"
        intro="Optional intro"
        onDone={onDone}
        onSkip={onSkip}
      />,
    )
  }

  it('renders title, the medical-signal disclaimer, and a Skip button', () => {
    renderPrompt()
    expect(screen.getByText('Log a quick reading?')).toBeInTheDocument()
    expect(screen.getByText(/not a medical measurement/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('submits a post reading linked to the session', async () => {
    const onDone = vi.fn()
    renderPrompt(onDone)
    fireEvent.change(screen.getByLabelText(/heart rate/i), { target: { value: '68' } })
    fireEvent.change(screen.getByLabelText(/hrv/i), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /save reading/i }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    const payload = mockCreate.mock.calls[0][0]
    expect(payload).toMatchObject({
      context: 'post',
      bpm: 68,
      hrv_ms: 45,
      session_id: 's1',
      source: 'manual',
    })
    expect(typeof payload.measured_at).toBe('string')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('omits HRV when left blank', async () => {
    renderPrompt()
    fireEvent.change(screen.getByLabelText(/heart rate/i), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: /save reading/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate.mock.calls[0][0].hrv_ms).toBeNull()
  })

  it('rejects an out-of-range heart rate without calling the API', async () => {
    renderPrompt()
    fireEvent.change(screen.getByLabelText(/heart rate/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /save reading/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/between 30 and 220/i)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('Skip calls onSkip and never saves', () => {
    const onSkip = vi.fn()
    renderPrompt(vi.fn(), onSkip)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

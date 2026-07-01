import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import EncouragementNote from './EncouragementNote'

describe('EncouragementNote', () => {
  afterEach(cleanup)

  it('shows a supportive message and a "send love" heart', () => {
    const { container } = render(<EncouragementNote />)
    expect(screen.getByRole('button', { name: /send a little love/i })).toBeInTheDocument()
    const message = container.querySelector('.encouragement-message')?.textContent ?? ''
    expect(message.length).toBeGreaterThan(3)
  })

  it('floats a few hearts and refreshes the message when the heart is tapped', () => {
    const { container } = render(<EncouragementNote />)
    const before = container.querySelector('.encouragement-message')?.textContent
    fireEvent.click(screen.getByRole('button', { name: /send a little love/i }))
    // A small flourish of floating hearts spawns.
    expect(container.querySelectorAll('.floating-heart').length).toBeGreaterThanOrEqual(3)
    // The message advances to a different one (never repeats the current).
    expect(container.querySelector('.encouragement-message')?.textContent).not.toBe(before)
  })
})

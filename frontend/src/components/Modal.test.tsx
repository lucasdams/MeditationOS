import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Modal from './Modal'

describe('Modal (shared overlay scaffold + a11y focus-trap)', () => {
  afterEach(cleanup)

  it('renders a labelled dialog with the shared overlay/card classes', () => {
    render(
      <Modal ariaLabel="Test dialog">
        <button type="button">Inside</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('modal-overlay')
    expect(dialog.querySelector('.modal-card')).not.toBeNull()
  })

  it('moves focus into the card on open', () => {
    render(
      <Modal ariaLabel="Focus test">
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>,
    )
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('traps Tab from the last focusable back to the first', () => {
    render(
      <Modal ariaLabel="Trap test">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    )
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  it('traps Shift+Tab from the first focusable to the last', () => {
    render(
      <Modal ariaLabel="Trap test">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    )
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('Escape calls onClose when provided', () => {
    const onClose = vi.fn()
    render(
      <Modal ariaLabel="Escape test" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape does nothing when no onClose is given', () => {
    render(
      <Modal ariaLabel="No close">
        <button type="button">Inside</button>
      </Modal>,
    )
    // Should not throw.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closeOnBackdrop calls onClose on overlay click but not card click', () => {
    const onClose = vi.fn()
    render(
      <Modal ariaLabel="Backdrop test" onClose={onClose} closeOnBackdrop>
        <button type="button">Inside</button>
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the previously focused element on unmount', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Opener'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(trigger).toHaveFocus()

    const { unmount } = render(
      <Modal ariaLabel="Restore test">
        <button type="button">Inside</button>
      </Modal>,
    )
    unmount()
    expect(trigger).toHaveFocus()
    document.body.removeChild(trigger)
  })
})

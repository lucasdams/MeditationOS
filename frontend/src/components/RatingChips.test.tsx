import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RatingChips from './RatingChips'

describe('RatingChips', () => {
  afterEach(cleanup)

  it('renders a labelled group with a "not rated" chip plus 1–5', () => {
    render(<RatingChips ariaLabel="Focus rating" value="" onChange={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Focus rating' })
    const buttons = group.querySelectorAll('button')
    expect(buttons).toHaveLength(6) // not-rated + 1..5
    expect(screen.getByRole('button', { name: /not rated/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('uses a custom "not rated" label when given', () => {
    render(
      <RatingChips ariaLabel="Calm" notRatedLabel="—" value="" onChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: '—' })).toBeInTheDocument()
  })

  it('marks the selected numeric chip pressed', () => {
    render(<RatingChips ariaLabel="Focus" value="3" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Rate 3 of 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /not rated/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('calls onChange with the chip value, and "" for not-rated', () => {
    const onChange = vi.fn()
    render(<RatingChips ariaLabel="Focus" value="2" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 of 5' }))
    expect(onChange).toHaveBeenCalledWith('4')
    fireEvent.click(screen.getByRole('button', { name: /not rated/i }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})

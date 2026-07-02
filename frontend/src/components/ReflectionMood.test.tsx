import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ReflectionMood, { REFLECTION_MOODS } from './ReflectionMood'

describe('ReflectionMood', () => {
  afterEach(cleanup)

  it('renders the curated mood shortlist', () => {
    render(<ReflectionMood value={null} onChange={() => {}} />)
    const group = screen.getByRole('group', { name: /mood \(optional\)/i })
    expect(within(group).getAllByRole('button')).toHaveLength(REFLECTION_MOODS.length)
  })

  it('reports the picked mood to the parent', () => {
    const onChange = vi.fn()
    render(<ReflectionMood value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /calm/i }))
    expect(onChange).toHaveBeenCalledWith('calm')
  })

  it('marks the selected mood as pressed', () => {
    render(<ReflectionMood value="peaceful" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /peaceful/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('clears the mood when the selected chip is tapped again (stays skippable)', () => {
    const onChange = vi.fn()
    render(<ReflectionMood value="calm" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /calm/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

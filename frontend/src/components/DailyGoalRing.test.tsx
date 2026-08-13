import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import DailyGoalRing from './DailyGoalRing'

function renderRing(todayMinutes: number, goalMinutes: number) {
  return render(
    <MemoryRouter>
      <DailyGoalRing todayMinutes={todayMinutes} goalMinutes={goalMinutes} />
    </MemoryRouter>,
  )
}

describe('DailyGoalRing', () => {
  afterEach(cleanup)

  it('renders progress toward the goal (not yet met)', () => {
    const { container } = renderRing(6, 10)
    // Center shows today's minutes over the goal.
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('/10')).toBeInTheDocument()
    // Accessible progress label, and the card is not in the met state.
    expect(
      screen.getByRole('img', { name: /6 of 10 minutes practiced today/i }),
    ).toBeInTheDocument()
    expect(container.querySelector('.goal-ring-card.met')).toBeNull()
    // The progress arc is partially filled (dashoffset > 0 ⇒ not complete).
    const progress = container.querySelector('.goal-ring-progress') as SVGCircleElement
    expect(Number(progress.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)
  })

  it('shows a soft met state once the goal is reached', () => {
    const { container } = renderRing(12, 10)
    expect(container.querySelector('.goal-ring-card.met')).not.toBeNull()
    expect(screen.getByRole('img', { name: /daily goal met/i })).toBeInTheDocument()
    // A gentle check replaces the counter; the arc is fully filled (dashoffset 0).
    expect(container.querySelector('.goal-ring-check')).not.toBeNull()
    const progress = container.querySelector('.goal-ring-progress') as SVGCircleElement
    expect(Number(progress.getAttribute('stroke-dashoffset'))).toBe(0)
  })

  it('guards against a zero goal without dividing by zero', () => {
    const { container } = renderRing(0, 0)
    // 0/0 is treated as a met goal (min goal floored to 1, done 0 < 1 ⇒ not met).
    expect(container.querySelector('.goal-ring-card')).not.toBeNull()
    const progress = container.querySelector('.goal-ring-progress') as SVGCircleElement
    // Finite offset (no NaN) — the whole track is empty.
    expect(Number.isNaN(Number(progress.getAttribute('stroke-dashoffset')))).toBe(false)
  })
})

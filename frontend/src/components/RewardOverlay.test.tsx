import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Brain } from 'lucide-react'
import RewardOverlay from './RewardOverlay'

// The reward plays a soft chime on mount; stub the audio so jsdom doesn't choke and the
// presentation is the only thing under test.
vi.mock('../lib/sfx', () => ({
  playReward: vi.fn(),
  playLevelUp: vi.fn(),
}))

// jsdom doesn't implement matchMedia. Force a prefers-reduced-motion result so the
// count-up settles synchronously and the final XP value is queryable without driving rAF.
function forceReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('RewardOverlay (quiet, non-blocking presentation)', () => {
  afterEach(() => {
    cleanup()
    // @ts-expect-error — reset the matchMedia stub between tests
    delete window.matchMedia
  })

  it('renders the gained XP value (count-up settles to the final number)', () => {
    // Under reduced motion the headline shows the final value immediately — no rAF needed.
    forceReducedMotion(true)
    render(<RewardOverlay afterXp={120} xpGained={20} onClose={() => {}} />)
    expect(screen.getByText('+20 XP')).toBeInTheDocument()
  })

  it('skips the flourish under prefers-reduced-motion', () => {
    forceReducedMotion(true)
    const { container } = render(
      <RewardOverlay afterXp={120} xpGained={20} onClose={() => {}} />,
    )
    // No particle burst and no entrance-pop modifier when motion is reduced.
    expect(container.querySelector('.reward-flourish')).toBeNull()
    expect(container.querySelector('.reward-card--pop')).toBeNull()
  })

  it('renders a polite status region, not a focus-trapping dialog', () => {
    render(<RewardOverlay afterXp={120} xpGained={20} onClose={() => {}} />)
    // Non-blocking: it is a live status region…
    const status = screen.getByRole('status')
    expect(status).toHaveClass('reward-inline')
    expect(status).toHaveAttribute('aria-live', 'polite')
    // …and explicitly NOT a modal dialog (the whole point of the change).
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the itemized XP breakdown when there is more than one source', () => {
    render(
      <RewardOverlay
        afterXp={140}
        xpGained={40}
        breakdown={[
          { label: 'Meditation', xp: 30, icon: Brain },
          { label: 'Daily quest', xp: 10 },
        ]}
        onClose={() => {}}
      />,
    )
    // Text-only labels (lucide icon renders beside them, not as emoji-in-text).
    expect(screen.getByText('Meditation')).toBeInTheDocument()
    expect(screen.getByText('Daily quest')).toBeInTheDocument()
    expect(screen.getByText('+30')).toBeInTheDocument()
    expect(screen.getByText('+10')).toBeInTheDocument()
  })

  it('calls onClose when the Continue button is pressed', () => {
    const onClose = vi.fn()
    render(<RewardOverlay afterXp={50} xpGained={10} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses (calls onClose) after autoDismissMs when set', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<RewardOverlay afterXp={50} xpGained={10} autoDismissMs={3000} onClose={onClose} />)
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not auto-dismiss when autoDismissMs is omitted', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<RewardOverlay afterXp={50} xpGained={10} onClose={onClose} />)
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(onClose).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

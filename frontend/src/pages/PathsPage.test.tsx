/**
 * Tests for the PathsPage (beginner-first revision §8).
 * Mocks services/paths so no backend is needed. Covers the required data-view states
 * (loading / error / empty), the not-enrolled → enroll flow, and the enrolled day list:
 * the current day surfaces its cue + a "Start" link with the right practice href, and
 * locked days are not actionable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listPaths = vi.fn()
const enrollPath = vi.fn()

vi.mock('../services/paths', () => ({
  pathsService: {
    list: (...a: unknown[]) => listPaths(...a),
    enroll: (...a: unknown[]) => enrollPath(...a),
  },
}))

import PathsPage from './PathsPage'
import type { PathDay, PathSummary } from '../types'

function day(overrides: Partial<PathDay>): PathDay {
  return {
    index: 1,
    title: 'Settle in',
    practice: 'breathe',
    min_minutes: 1,
    cue: 'Just follow the orb.',
    status: 'locked',
    ...overrides,
  }
}

// A not-enrolled "First 7 Days" summary (days present but all locked until enrolled).
const notEnrolled: PathSummary = {
  id: 'first-7',
  title: 'Your First 7 Days',
  blurb: 'A gentle week to build the habit.',
  total_days: 7,
  enrolled: false,
  started_on: null,
  current_day: null,
  completed: false,
  completed_days: 0,
  days: [day({ index: 1, status: 'locked' })],
}

// An enrolled, mid-course path: Day 1 done, Day 2 the current breathe day (3 min), Day 3 locked.
const enrolled: PathSummary = {
  id: 'first-7',
  title: 'Your First 7 Days',
  blurb: 'A gentle week to build the habit.',
  total_days: 7,
  enrolled: true,
  started_on: '2026-06-26',
  current_day: 2,
  completed: false,
  completed_days: 1,
  days: [
    day({ index: 1, title: 'One slow minute', practice: 'breathe', min_minutes: 1, status: 'done' }),
    day({
      index: 2,
      title: 'Shoulders drop',
      practice: 'breathe',
      min_minutes: 3,
      cue: 'Notice your shoulders drop on the out-breath.',
      status: 'current',
    }),
    day({ index: 3, title: 'Rest the breath', practice: 'meditate', min_minutes: 3, status: 'locked' }),
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PathsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listPaths.mockReset()
  enrollPath.mockReset()
})
afterEach(cleanup)

describe('PathsPage — data-view states', () => {
  it('shows a loading line while the paths load', () => {
    // A never-resolving promise keeps the page in its loading state.
    listPaths.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/gathering the paths/i)).toBeInTheDocument()
  })

  it('shows a retryable error when the load fails, and retries', async () => {
    listPaths.mockRejectedValueOnce(new Error('boom'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load the paths/i)

    // Retrying re-runs the fetch; this time it resolves with one path (a not-enrolled card,
    // whose whole surface is the "Start <title>" enroll button).
    listPaths.mockResolvedValueOnce({ paths: [notEnrolled] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(
      await screen.findByRole('button', { name: /start your first 7 days/i }),
    ).toBeInTheDocument()
  })

  it('shows an empty state when there are no paths', async () => {
    listPaths.mockResolvedValue({ paths: [] })
    renderPage()
    expect(await screen.findByText(/no paths yet/i)).toBeInTheDocument()
  })
})

describe('PathsPage — not enrolled', () => {
  it('renders the not-enrolled path as a card (icon chip + blurb + progress line)', async () => {
    listPaths.mockResolvedValue({ paths: [notEnrolled] })
    renderPage()

    // The card head: title, blurb, and the calm not-enrolled progress line.
    expect(await screen.findByText(/your first 7 days/i)).toBeInTheDocument()
    expect(screen.getByText(/a gentle week to build the habit/i)).toBeInTheDocument()
    expect(screen.getByText(/7 days · a gentle place to begin/i)).toBeInTheDocument()
  })

  it('the whole card is an enroll button that calls enroll and re-renders the enrolled path', async () => {
    listPaths.mockResolvedValue({ paths: [notEnrolled] })
    enrollPath.mockResolvedValue(enrolled)
    renderPage()

    // The not-enrolled card is itself the enroll affordance (aria-label "Start <title>").
    const startBtn = await screen.findByRole('button', { name: /start your first 7 days/i })
    fireEvent.click(startBtn)

    // The service was called with the path id…
    expect(enrollPath).toHaveBeenCalledWith('first-7')

    // …and once it resolves the enrolled day list renders (the current day's "Start" appears).
    expect(await screen.findByRole('link', { name: /start day 2/i })).toBeInTheDocument()
    // The enroll button is gone now that we're enrolled.
    expect(screen.queryByRole('button', { name: /start your first 7 days/i })).not.toBeInTheDocument()
  })
})

describe('PathsPage — enrolled', () => {
  beforeEach(() => {
    listPaths.mockResolvedValue({ paths: [enrolled] })
  })

  it('renders the days, with the current day showing its cue and a "Start" link to the right practice', async () => {
    renderPage()

    // The current (Day 2) breathe day, 3 min → guided breathe at 180s.
    const start = await screen.findByRole('link', { name: /start day 2/i })
    expect(start).toHaveAttribute('href', '/breathe?guided=1&duration=180')

    // Its cue is on screen.
    expect(screen.getByText(/notice your shoulders drop/i)).toBeInTheDocument()

    // Warm re-entry copy, never a "you missed days" scold.
    expect(screen.getByText(/welcome back — you're on day 2/i)).toBeInTheDocument()
  })

  it('does not make locked or done days actionable (only the current day has a Start link)', async () => {
    renderPage()
    await screen.findByRole('link', { name: /start day 2/i })

    // Exactly one "Start" action across the whole list — the current day.
    expect(screen.getAllByRole('link', { name: /^start day/i })).toHaveLength(1)

    // The locked Day 3 is present as text but carries no link/button.
    const lockedDay = screen.getByText('Rest the breath').closest('li') as HTMLElement
    expect(within(lockedDay).queryByRole('link')).toBeNull()
    expect(within(lockedDay).queryByRole('button')).toBeNull()
  })
})

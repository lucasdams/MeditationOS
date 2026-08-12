/**
 * Light smoke tests for the AnalyticsPage: the month-vs-last card and the mood-over-time
 * threshold. The consistency heatmap self-fetches via a mocked dashboard service.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getAnalytics = vi.fn()
const getInsights = vi.fn()
const getConsistency = vi.fn()
const listBiometrics = vi.fn()
const deltaBiometrics = vi.fn()

vi.mock('../services/analytics', () => ({
  analyticsService: {
    get: (...a: unknown[]) => getAnalytics(...a),
    insights: (...a: unknown[]) => getInsights(...a),
  },
}))
vi.mock('../services/biometrics', () => ({
  biometricsService: {
    list: (...a: unknown[]) => listBiometrics(...a),
    delta: (...a: unknown[]) => deltaBiometrics(...a),
  },
}))
// The ConsistencyHeatmap self-fetches via the dashboard service — mock it so the page
// renders without a backend.
vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getConsistency: (...a: unknown[]) => getConsistency(...a),
  },
}))

import AnalyticsPage from './AnalyticsPage'
import type { AnalyticsSummary } from '../types'

const fakeMonthly = {
  this_month: { month_start: '2026-06-01', minutes: 120, sessions: 8, days_practiced: 6 },
  last_month: { month_start: '2026-05-01', minutes: 90, sessions: 6, days_practiced: 5 },
  minutes_delta: 30,
  sessions_delta: 2,
  days_practiced_delta: 1,
}

const fakeSummary: AnalyticsSummary = {
  total_sessions: 12,
  total_minutes: 240,
  days_practiced: 8,
  by_type: [],
  by_weekday: [],
  by_time_of_day: [],
  minutes_by_week: [{ week_start: '2026-06-08', minutes: 60 }],
  moods: [],
  mood_by_week: [],
  monthly_comparison: fakeMonthly,
  ratings_by_week: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  getAnalytics.mockReset()
  getInsights.mockReset()
  getConsistency.mockReset()
  // The consistency heatmap self-fetches; keep it quiet/empty here.
  getConsistency.mockResolvedValue({ start: '2026-05-20', end: '2026-08-12', days: [] })
  listBiometrics.mockReset()
  deltaBiometrics.mockReset()
  // The insights and biometric panels stay quiet on failure; keep them empty/quiet here.
  getInsights.mockResolvedValue({ needs_more_data: true, insights: [] })
  listBiometrics.mockResolvedValue([])
  deltaBiometrics.mockResolvedValue({
    sample_size: 0,
    avg_bpm_delta: null,
    avg_hrv_ms_delta: null,
    hrv_sample_size: 0,
  })
})
afterEach(cleanup)

describe('AnalyticsPage — this month vs last', () => {
  it('renders the card with the month totals and a positive (▲ more) delta', async () => {
    getAnalytics.mockResolvedValue(fakeSummary)

    renderPage()

    expect(
      await screen.findByRole('heading', { name: /this month vs last/i, level: 2 }),
    ).toBeInTheDocument()
    // This month's totals show…
    expect(screen.getByText('120')).toBeInTheDocument() // minutes this month
    // …and the signed delta reads as "more than last month" (▲).
    expect(screen.getByText(/30 min more than last month/i)).toBeInTheDocument()
    expect(screen.getByText(/2 sessions more than last month/i)).toBeInTheDocument()
  })

  it('renders a ▼ "fewer" delta for a quieter month', async () => {
    getAnalytics.mockResolvedValue({
      ...fakeSummary,
      monthly_comparison: {
        ...fakeMonthly,
        minutes_delta: -45,
        sessions_delta: -3,
        days_practiced_delta: -2,
      },
    })

    renderPage()

    expect(await screen.findByText(/45 min fewer than last month/i)).toBeInTheDocument()
  })

  it('reads "same as last month" when a metric is unchanged', async () => {
    getAnalytics.mockResolvedValue({
      ...fakeSummary,
      monthly_comparison: {
        ...fakeMonthly,
        minutes_delta: 0,
        sessions_delta: 0,
        days_practiced_delta: 0,
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: /this month vs last/i, level: 2 })
    expect(screen.getAllByText(/same as last month/i).length).toBeGreaterThan(0)
  })
})

describe('AnalyticsPage — mood over time threshold', () => {
  const moodWeek = (week_start: string, counts: Record<string, number>) => ({
    week_start,
    counts,
  })

  it('hides the mood-over-time chart below the minimum sample', async () => {
    getAnalytics.mockResolvedValue({
      ...fakeSummary,
      moods: [{ mood: 'calm', count: 3 }],
      // Only 3 tagged entries across weeks — below the 6-entry threshold.
      mood_by_week: [moodWeek('2026-06-01', { calm: 3 })],
    })

    renderPage()

    await screen.findByText(/hours practiced/i)
    expect(
      screen.queryByRole('heading', { name: /mood over time/i, level: 2 }),
    ).not.toBeInTheDocument()
  })

  it('shows the mood-over-time chart once enough entries exist', async () => {
    getAnalytics.mockResolvedValue({
      ...fakeSummary,
      moods: [
        { mood: 'calm', count: 5 },
        { mood: 'tired', count: 3 },
      ],
      // 8 tagged entries across two weeks — clears the threshold.
      mood_by_week: [
        moodWeek('2026-06-01', { calm: 3, tired: 1 }),
        moodWeek('2026-06-08', { calm: 2, tired: 2 }),
      ],
    })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: /mood over time/i, level: 2 }),
    ).toBeInTheDocument()
  })
})

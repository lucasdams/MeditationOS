/**
 * Light smoke tests for the AnalyticsPage.
 * Focus: the activity calendar (ActivityHeatmap) now lives here — moved off the calm home —
 * alongside the rest of the practice stats. The real heatmap is mounted with a mocked
 * dashboard service so we exercise its own self-fetch and loading/empty/error behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getAnalytics = vi.fn()
const getInsights = vi.fn()
const getActivity = vi.fn()
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
// Use the real ActivityHeatmap; it fetches via the dashboard service, which we mock so the
// component renders its actual "Activity" calendar without a backend.
vi.mock('../services/dashboard', () => ({
  dashboardService: {
    getActivity: (...a: unknown[]) => getActivity(...a),
  },
}))

import AnalyticsPage from './AnalyticsPage'
import type { AnalyticsSummary, ActivityCalendar } from '../types'

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
  ratings_by_week: [],
}

const fakeCalendar: ActivityCalendar = {
  start: '2026-05-15',
  end: '2026-06-18',
  days: [
    { date: '2026-06-16', seconds: 600, all_quests: true },
    { date: '2026-06-17', seconds: 300, all_quests: false },
  ],
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
  getActivity.mockReset()
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

describe('AnalyticsPage — activity calendar', () => {
  it('renders the ActivityHeatmap (moved here from the home) once stats load', async () => {
    getAnalytics.mockResolvedValue(fakeSummary)
    getActivity.mockResolvedValue(fakeCalendar)

    renderPage()

    // The summary stats render…
    expect(await screen.findByText(/hours practiced/i)).toBeInTheDocument()
    // …and the activity calendar (its own "Activity" heading) appears alongside them.
    expect(
      await screen.findByRole('heading', { name: /^activity$/i, level: 2 }),
    ).toBeInTheDocument()
    // The heatmap was asked for its own data — it brought its self-fetch to Analytics.
    expect(getActivity).toHaveBeenCalled()
  })

  it('shows the heatmap loading state while its data is in flight', async () => {
    getAnalytics.mockResolvedValue(fakeSummary)
    getActivity.mockReturnValue(new Promise(() => {})) // pending forever

    renderPage()

    await screen.findByText(/hours practiced/i)
    expect(await screen.findByText(/loading activity/i)).toBeInTheDocument()
  })

  it('stays quiet if the heatmap fetch fails (no Activity heading, page still renders)', async () => {
    getAnalytics.mockResolvedValue(fakeSummary)
    getActivity.mockRejectedValue(new Error('boom'))

    renderPage()

    await screen.findByText(/hours practiced/i)
    await waitFor(() =>
      expect(screen.queryByText(/loading activity/i)).not.toBeInTheDocument(),
    )
    // The failed heatmap renders nothing; the rest of the analytics page is unaffected.
    expect(
      screen.queryByRole('heading', { name: /^activity$/i, level: 2 }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /analytics/i, level: 1 })).toBeInTheDocument()
  })
})

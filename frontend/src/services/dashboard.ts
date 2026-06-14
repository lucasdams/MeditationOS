import { api } from './api'
import type { ActivityCalendar, DashboardStats, WeeklyReview } from '../types'

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
  getActivity: (days?: number) =>
    api.get<ActivityCalendar>(
      `/dashboard/activity${days ? `?days=${days}` : ''}`,
    ),
  getWeeklyReview: () => api.get<WeeklyReview>('/dashboard/weekly-review'),
}

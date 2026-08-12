import { api } from './api'
import type {
  ActivityCalendar,
  ConsistencyCalendar,
  DashboardStats,
  WeeklyReview,
} from '../types'

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
  getActivity: (days?: number) =>
    api.get<ActivityCalendar>(
      `/dashboard/activity${days ? `?days=${days}` : ''}`,
    ),
  // Per-day practice over the last ~12 weeks for the consistency heatmap.
  getConsistency: () => api.get<ConsistencyCalendar>('/dashboard/consistency'),
  getWeeklyReview: () => api.get<WeeklyReview>('/dashboard/weekly-review'),
}

import { api } from './api'
import type {
  ConsistencyCalendar,
  DashboardStats,
  WeeklyReview,
} from '../types'

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
  // Per-day practice over the last ~12 weeks for the consistency heatmap.
  getConsistency: () => api.get<ConsistencyCalendar>('/dashboard/consistency'),
  getWeeklyReview: () => api.get<WeeklyReview>('/dashboard/weekly-review'),
}

import { api } from './api'
import type { ActivityCalendar, DashboardStats } from '../types'

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
  getActivity: () => api.get<ActivityCalendar>('/dashboard/activity'),
}

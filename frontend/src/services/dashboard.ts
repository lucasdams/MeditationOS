import { api } from './api'
import type { DashboardStats } from '../types'

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),
}

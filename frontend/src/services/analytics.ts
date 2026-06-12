import { api } from './api'
import type { AnalyticsSummary } from '../types'

export const analyticsService = {
  get: () => api.get<AnalyticsSummary>('/analytics'),
}

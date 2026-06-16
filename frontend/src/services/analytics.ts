import { api } from './api'
import type { AnalyticsSummary, InsightsResponse } from '../types'

export const analyticsService = {
  get: () => api.get<AnalyticsSummary>('/analytics'),
  insights: () => api.get<InsightsResponse>('/analytics/insights'),
}

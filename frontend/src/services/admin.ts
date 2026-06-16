import { api } from './api'
import type { AdminMetrics } from '../types'

// Admin-only endpoints. The backend gates every /admin/* route with require_admin
// (403 for non-admins), so a non-admin reaching these would just get an error.
export const adminService = {
  metrics: () => api.get<AdminMetrics>('/admin/metrics'),
}

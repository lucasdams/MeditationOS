import { api } from './api'
import type {
  AdminMetrics,
  AdminUserDetail,
  AdminUserList,
  AuditList,
} from '../types'
import type { AdminFeedbackList } from './feedback'

// Admin-only endpoints. The backend gates every /admin/* route with require_admin
// (403 for non-admins), so a non-admin reaching these would just get an error.
export const adminService = {
  metrics: () => api.get<AdminMetrics>('/admin/metrics'),

  // User management / support. Reads return account metadata + counts only (no content).
  listUsers: (params: { q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<AdminUserList>(`/admin/users${suffix}`)
  },
  getUser: (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`),
  resendVerification: (id: string) =>
    api.post<{ detail: string }>(`/admin/users/${id}/resend-verification`),
  disableUser: (id: string) => api.post<AdminUserDetail>(`/admin/users/${id}/disable`),
  enableUser: (id: string) => api.post<AdminUserDetail>(`/admin/users/${id}/enable`),
  deleteUser: (id: string) => api.del<void>(`/admin/users/${id}`),

  // Audit log (newest-first, paginated).
  audit: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<AuditList>(`/admin/audit${suffix}`)
  },
  // In-app feedback inbox (newest-first, paginated). Admin-only.
  listFeedback: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get<AdminFeedbackList>(`/admin/feedback${suffix}`)
  },
}

import { api } from './api'
import type { Session, SessionCreate } from '../types'

export const sessionService = {
  create: (data: SessionCreate) => api.post<Session>('/sessions', data),
  update: (id: string, data: Partial<SessionCreate>) =>
    api.patch<Session>(`/sessions/${id}`, data),
  list: (opts?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    if (opts?.offset != null) p.set('offset', String(opts.offset))
    const qs = p.toString()
    return api.get<Session[]>(`/sessions${qs ? `?${qs}` : ''}`)
  },
  remove: (id: string) => api.del<void>(`/sessions/${id}`),
}

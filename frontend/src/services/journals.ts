import { api } from './api'
import type { Journal, JournalCreate } from '../types'

export const journalService = {
  list: (opts?: { mood?: string; limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (opts?.mood) p.set('mood', opts.mood)
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    if (opts?.offset != null) p.set('offset', String(opts.offset))
    const qs = p.toString()
    return api.get<Journal[]>(`/journals${qs ? `?${qs}` : ''}`)
  },
  create: (data: JournalCreate) => api.post<Journal>('/journals', data),
  remove: (id: string) => api.del<void>(`/journals/${id}`),
}

import { api } from './api'
import type { Journal, JournalCreate, Mood } from '../types'

export const journalService = {
  list: (opts?: { mood?: string; q?: string; limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (opts?.mood) p.set('mood', opts.mood)
    if (opts?.q) p.set('q', opts.q)
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    if (opts?.offset != null) p.set('offset', String(opts.offset))
    const qs = p.toString()
    return api.get<Journal[]>(`/journals${qs ? `?${qs}` : ''}`)
  },
  create: (data: JournalCreate) => api.post<Journal>('/journals', data),
  update: (id: string, data: { body?: string; mood?: Mood | null }) =>
    api.patch<Journal>(`/journals/${id}`, data),
  remove: (id: string) => api.del<void>(`/journals/${id}`),
}

import { api } from './api'
import type { Prayer, PrayerCreate, PrayerUpdate } from '../types'

export const prayerService = {
  list: (opts?: { answered?: boolean; limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (opts?.answered != null) p.set('answered', String(opts.answered))
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    if (opts?.offset != null) p.set('offset', String(opts.offset))
    const qs = p.toString()
    return api.get<Prayer[]>(`/prayers${qs ? `?${qs}` : ''}`)
  },
  create: (data: PrayerCreate) => api.post<Prayer>('/prayers', data),
  update: (id: string, data: PrayerUpdate) => api.patch<Prayer>(`/prayers/${id}`, data),
  remove: (id: string) => api.del<void>(`/prayers/${id}`),
}

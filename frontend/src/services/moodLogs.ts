import { api } from './api'
import type { Mood, MoodLog } from '../types'

export const moodLogService = {
  create: (mood: Mood) => api.post<MoodLog>('/mood-logs', { mood }),
  list: (opts?: { days?: number; limit?: number }) => {
    const p = new URLSearchParams()
    if (opts?.days != null) p.set('days', String(opts.days))
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    const qs = p.toString()
    return api.get<MoodLog[]>(`/mood-logs${qs ? `?${qs}` : ''}`)
  },
  remove: (id: string) => api.del<void>(`/mood-logs/${id}`),
}

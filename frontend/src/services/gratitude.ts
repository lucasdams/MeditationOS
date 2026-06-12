import { api } from './api'
import type {
  Gratitude,
  GratitudeCategory,
  GratitudeCreate,
  GratitudeSuggestions,
} from '../types'

export const gratitudeService = {
  create: (data: GratitudeCreate) => api.post<Gratitude>('/gratitude', data),
  list: (opts?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    if (opts?.offset != null) p.set('offset', String(opts.offset))
    const qs = p.toString()
    return api.get<Gratitude[]>(`/gratitude${qs ? `?${qs}` : ''}`)
  },
  remove: (id: string) => api.del<void>(`/gratitude/${id}`),
  suggestions: (category: GratitudeCategory) =>
    api.get<GratitudeSuggestions>(`/gratitude/suggestions?category=${category}`),
}

import { api } from './api'
import type {
  Gratitude,
  GratitudeCategory,
  GratitudeCreate,
  GratitudeSuggestions,
} from '../types'

export const gratitudeService = {
  create: (data: GratitudeCreate) => api.post<Gratitude>('/gratitude', data),
  list: () => api.get<Gratitude[]>('/gratitude'),
  remove: (id: string) => api.del<void>(`/gratitude/${id}`),
  suggestions: (category: GratitudeCategory) =>
    api.get<GratitudeSuggestions>(`/gratitude/suggestions?category=${category}`),
}

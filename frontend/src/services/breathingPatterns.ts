import { api } from './api'
import type { BreathingPattern, BreathingPatternCreate } from '../types'

export const breathingPatternService = {
  list: () => api.get<BreathingPattern[]>('/breathing-patterns'),
  create: (data: BreathingPatternCreate) =>
    api.post<BreathingPattern>('/breathing-patterns', data),
  remove: (id: string) => api.del<void>(`/breathing-patterns/${id}`),
}

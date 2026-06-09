import { api } from './api'
import type { BreathingPattern } from '../types'

export const breathingPatternService = {
  list: () => api.get<BreathingPattern[]>('/breathing-patterns'),
}

import { api } from './api'
import type { Journal, JournalCreate } from '../types'

export const journalService = {
  list: (mood?: string) =>
    api.get<Journal[]>(`/journals${mood ? `?mood=${encodeURIComponent(mood)}` : ''}`),
  create: (data: JournalCreate) => api.post<Journal>('/journals', data),
  remove: (id: string) => api.del<void>(`/journals/${id}`),
}

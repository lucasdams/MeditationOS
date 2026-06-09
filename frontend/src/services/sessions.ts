import { api } from './api'
import type { Session, SessionCreate } from '../types'

export const sessionService = {
  create: (data: SessionCreate) => api.post<Session>('/sessions', data),
  list: () => api.get<Session[]>('/sessions'),
  remove: (id: string) => api.del<void>(`/sessions/${id}`),
}

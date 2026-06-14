import { api } from './api'
import type { ScheduledSession, ScheduledSessionCreate } from '../types'

export const scheduledSessionService = {
  create: (data: ScheduledSessionCreate) =>
    api.post<ScheduledSession>('/scheduled-sessions', data),
  list: (upcoming = true) =>
    api.get<ScheduledSession[]>(`/scheduled-sessions?upcoming=${upcoming}`),
  remove: (id: string) => api.del<void>(`/scheduled-sessions/${id}`),
  // The .ics endpoint streams a file; link to it so the browser downloads it (the
  // httpOnly auth cookie rides along on the same-origin navigation).
  icsUrl: (id: string) =>
    `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'}/scheduled-sessions/${id}/ics`,
}

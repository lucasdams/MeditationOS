import { api } from './api'
import type { BiometricDelta, BiometricReading, BiometricReadingCreate } from '../types'

export const biometricsService = {
  create: (data: BiometricReadingCreate) =>
    api.post<BiometricReading>('/biometric-readings', data),
  list: (opts?: { days?: number; limit?: number }) => {
    const p = new URLSearchParams()
    if (opts?.days != null) p.set('days', String(opts.days))
    if (opts?.limit != null) p.set('limit', String(opts.limit))
    const qs = p.toString()
    return api.get<BiometricReading[]>(`/biometric-readings${qs ? `?${qs}` : ''}`)
  },
  delta: (opts?: { days?: number }) => {
    const p = new URLSearchParams()
    if (opts?.days != null) p.set('days', String(opts.days))
    const qs = p.toString()
    return api.get<BiometricDelta>(`/biometric-readings/delta${qs ? `?${qs}` : ''}`)
  },
  // Backfill a pre-session reading's session link once the sit has been saved, so
  // the pre/post calming delta can pair them.
  linkSession: (id: string, sessionId: string) =>
    api.patch<BiometricReading>(`/biometric-readings/${id}/session`, {
      session_id: sessionId,
    }),
  remove: (id: string) => api.del<void>(`/biometric-readings/${id}`),
}

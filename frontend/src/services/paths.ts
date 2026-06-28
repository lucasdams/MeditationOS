import { api } from './api'
import type { PathList, PathSummary } from '../types'

// The Paths API (beginner-first revision §8). A Path is a short multi-day guided course;
// day-completion is derived server-side from real logged activity, so the client only reads
// state and never reports progress. Thin wrappers over the shared `api` fetch helper.
export const pathsService = {
  // Every path with the caller's derived enrollment state (enrolled?, current day, per-day
  // status). Returns the available paths so the list page can render in one call.
  list: () => api.get<PathList>('/paths'),
  // Enrol the user in a path (idempotent: re-enrolling is harmless). Returns the now-enrolled
  // path so the caller can swap it straight into view (refetch-free).
  enroll: (pathId: string) =>
    api.post<PathSummary>(`/paths/${pathId}/enroll`),
}

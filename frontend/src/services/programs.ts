import { api } from './api'
import type { Enrollment, ProgramDetail, ProgramSummary } from '../types'

export const programService = {
  listCatalog: () => api.get<ProgramSummary[]>('/programs'),
  getProgram: (key: string) => api.get<ProgramDetail>(`/programs/${key}`),
  listEnrollments: () => api.get<Enrollment[]>('/programs/enrollments'),
  enroll: (programKey: string) =>
    api.post<Enrollment>('/programs/enrollments', { program_key: programKey }),
  advance: (id: string) => api.post<Enrollment>(`/programs/enrollments/${id}/advance`),
  leave: (id: string) => api.del<void>(`/programs/enrollments/${id}`),
}

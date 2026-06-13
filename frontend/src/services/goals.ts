import { api } from './api'
import type { Goal, GoalCreate, GoalStatus } from '../types'

export const goalService = {
  list: (status?: GoalStatus) =>
    api.get<Goal[]>(`/goals${status ? `?status=${status}` : ''}`),
  create: (data: GoalCreate) => api.post<Goal>('/goals', data),
  setStatus: (id: string, status: GoalStatus) =>
    api.patch<Goal>(`/goals/${id}`, { status }),
  remove: (id: string) => api.del<void>(`/goals/${id}`),
  // Custom-habit goals: mark today done / undo today.
  checkIn: (id: string) => api.post<Goal>(`/goals/${id}/checkins`),
  undoCheckIn: (id: string) => api.del<Goal>(`/goals/${id}/checkins/today`),
}

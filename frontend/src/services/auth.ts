import { api } from './api'
import type { User } from '../types'

export const authService = {
  register: (email: string, password: string) =>
    api.post<User>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    api.post<User>('/auth/login', { email, password }),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<User>('/auth/me'),
}

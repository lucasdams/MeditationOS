import { api } from './api'
import type { User } from '../types'

export const authService = {
  register: (email: string, password: string) =>
    api.post<User>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    api.post<User>('/auth/login', { email, password }),

  googleLogin: (credential: string) => api.post<User>('/auth/google', { credential }),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<User>('/auth/me'),

  setUsername: (username: string) => api.post<User>('/auth/username', { username }),

  setTimezone: (timezone: string) => api.post<User>('/auth/timezone', { timezone }),

  // current_password is omitted when a Google-only account sets its first password.
  setPassword: (newPassword: string, currentPassword?: string) =>
    api.post<User>('/auth/password', {
      new_password: newPassword,
      current_password: currentPassword ?? null,
    }),

  // hour (0–23, local) is required when enabled; omitted/null when disabling.
  setReminders: (enabled: boolean, hour: number | null) =>
    api.post<User>('/auth/reminders', { enabled, hour: enabled ? hour : null }),
}

import { api } from './api'
import type { User } from '../types'

export const authService = {
  register: (email: string, password: string) =>
    api.post<User>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    api.post<User>('/auth/login', { email, password }),

  googleLogin: (credential: string) => api.post<User>('/auth/google', { credential }),

  // Create an anonymous account and sign in — "use without signing up".
  guest: () => api.post<User>('/auth/guest'),

  // Convert the current guest account into a real one.
  claim: (email: string, password: string) =>
    api.post<User>('/auth/claim', { email, password }),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<User>('/auth/me'),

  setUsername: (username: string) => api.post<User>('/auth/username', { username }),

  setTimezone: (timezone: string) => api.post<User>('/auth/timezone', { timezone }),

  // Choose which daily-activity quests to receive (≥3; validated server-side).
  setQuestFeatures: (features: string[]) =>
    api.post<User>('/auth/quest-features', { features }),

  // current_password is omitted when a Google-only account sets its first password.
  setPassword: (newPassword: string, currentPassword?: string) =>
    api.post<User>('/auth/password', {
      new_password: newPassword,
      current_password: currentPassword ?? null,
    }),

  setEmail: (newEmail: string, currentPassword: string) =>
    api.post<User>('/auth/email', {
      new_email: newEmail,
      current_password: currentPassword,
    }),

  // hour (0–23, local) is required when enabled; omitted/null when disabling.
  setReminders: (enabled: boolean, hour: number | null) =>
    api.post<User>('/auth/reminders', { enabled, hour: enabled ? hour : null }),

  // Always resolves the same way (no account enumeration).
  requestPasswordReset: (email: string) =>
    api.post<void>('/auth/password/reset-request', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<void>('/auth/password/reset', { token, new_password: newPassword }),

  verifyEmail: (token: string) => api.post<void>('/auth/verify-email', { token }),

  resendVerification: () => api.post<void>('/auth/verify-email/resend'),

  exportData: () => api.get<Record<string, unknown>>('/auth/export'),

  deleteAccount: () => api.del<void>('/auth/me'),
}

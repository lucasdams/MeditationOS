import { api } from './api'

export type FeedbackCategory = 'bug' | 'idea' | 'praise' | 'other'

export interface FeedbackRead {
  id: string
  category: FeedbackCategory
  message: string
  path: string | null
  created_at: string
}

// Admin-only inbox row — carries the sender's email so the owner can follow up.
export interface AdminFeedback extends FeedbackRead {
  email: string | null
}

export interface AdminFeedbackList {
  entries: AdminFeedback[]
  total: number
}

export const feedbackService = {
  submit: (data: { category: FeedbackCategory; message: string; path?: string | null }) =>
    api.post<FeedbackRead>('/feedback', data),
}

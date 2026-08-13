import { api } from './api'
import type {
  PhilosopherChatResponse,
  PhilosopherSummary,
  PhilosopherTurn,
} from '../types'

export const philosopherService = {
  // The picker roster (auth required).
  list: () => api.get<PhilosopherSummary[]>('/philosophers'),
  // Send the full (bounded) conversation history and get the guide's next reply.
  // The chat is stateless server-side — nothing is persisted. 403 for guests,
  // 429 once the daily message cap is hit.
  chat: (id: string, messages: PhilosopherTurn[]) =>
    api.post<PhilosopherChatResponse>(`/philosophers/${id}/chat`, { messages }),
}

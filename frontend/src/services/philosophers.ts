import { api } from './api'
import type {
  PhilosopherChatDetail,
  PhilosopherChatResponse,
  PhilosopherChatSummary,
  PhilosopherSummary,
  PhilosopherTurn,
} from '../types'

export const philosopherService = {
  // The picker roster (auth required).
  list: () => api.get<PhilosopherSummary[]>('/philosophers'),
  // Send the full (bounded) conversation history and get the guide's next reply. The exchange
  // is persisted to a saved conversation: pass `chatId` to append to an existing one, omit it
  // to start a new one (the response carries the id either way). 403 for guests, 429 at the cap.
  chat: (id: string, messages: PhilosopherTurn[], chatId?: string) =>
    api.post<PhilosopherChatResponse>(`/philosophers/${id}/chat`, {
      messages,
      ...(chatId ? { chat_id: chatId } : {}),
    }),
  // The caller's saved conversations, newest-touched first (no message content).
  listConversations: () =>
    api.get<PhilosopherChatSummary[]>('/philosophers/conversations'),
  // A saved conversation's full turns, for reopening it.
  getConversation: (chatId: string) =>
    api.get<PhilosopherChatDetail>(`/philosophers/conversations/${chatId}`),
  // Delete a saved conversation.
  deleteConversation: (chatId: string) =>
    api.del<void>(`/philosophers/conversations/${chatId}`),
}

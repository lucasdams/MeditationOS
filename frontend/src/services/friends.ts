import { api } from './api'
import type { Friend, FriendRequests } from '../types'

// Friends API. Requests are sent by username; a friend's payload is stats-only
// (level · streak · recent activity), never private content — see the backend
// friend_service. All calls carry the auth cookie via the shared api wrapper.
export const friendsService = {
  // My accepted friends, each with their stat summary.
  list: () => api.get<Friend[]>('/friends'),
  // My incoming + outgoing pending requests.
  requests: () => api.get<FriendRequests>('/friends/requests'),
  // Send a friend request to the account with this username (204 on success).
  sendRequest: (username: string) => api.post<void>('/friends/requests', { username }),
  // Accept / decline an incoming request (addressee only).
  accept: (friendshipId: string) => api.post<void>(`/friends/requests/${friendshipId}/accept`),
  decline: (friendshipId: string) => api.post<void>(`/friends/requests/${friendshipId}/decline`),
  // Remove an accepted friend by their user id (either side may).
  remove: (userId: string) => api.del<void>(`/friends/${userId}`),
}

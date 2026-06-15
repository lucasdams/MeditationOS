import { api } from './api'
import type { SanctuaryScene } from '../types'

export const sanctuaryService = {
  getScene: () => api.get<SanctuaryScene>('/sanctuary'),
  buy: (itemKey: string) =>
    api.post<SanctuaryScene>('/sanctuary/buy', { item_key: itemKey }),
  upgrade: (id: string) => api.post<SanctuaryScene>(`/sanctuary/items/${id}/upgrade`),
}

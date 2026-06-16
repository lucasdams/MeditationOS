import { api } from './api'
import type { SanctuaryScene } from '../types'

export const sanctuaryService = {
  getScene: () => api.get<SanctuaryScene>('/sanctuary'),
  // Buy an item, optionally picking a base form (variant). null = the item's default.
  buy: (itemKey: string, variant: string | null = null) =>
    api.post<SanctuaryScene>('/sanctuary/buy', { item_key: itemKey, variant }),
  // Apply a mix-and-match customization (slot → option) to an owned item.
  customize: (id: string, slot: string, option: string) =>
    api.post<SanctuaryScene>(`/sanctuary/items/${id}/customize`, { slot, option }),
}

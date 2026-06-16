import { api } from './api'
import type { SanctuaryScene } from '../types'

// A partial cosmetic update for an owned item (ADR-0015). Only the keys present are
// changed server-side; pass name/note: null to clear, favorite to pin/unpin.
export interface PersonalizePatch {
  name?: string | null
  note?: string | null
  favorite?: boolean
}

export const sanctuaryService = {
  getScene: () => api.get<SanctuaryScene>('/sanctuary'),
  // Buy an item, optionally picking a base form (variant) and a name (plaque). null = the
  // item's default variant / no name.
  buy: (itemKey: string, variant: string | null = null, name: string | null = null) =>
    api.post<SanctuaryScene>('/sanctuary/buy', { item_key: itemKey, variant, name }),
  // Set/clear an owned item's cosmetic personalization (name, note, favourite). Partial:
  // only the provided fields change; never affects coins.
  personalize: (id: string, patch: PersonalizePatch) =>
    api.patch<SanctuaryScene>(`/sanctuary/items/${id}`, patch),
  // Apply a mix-and-match customization (slot → option) to an owned item.
  customize: (id: string, slot: string, option: string) =>
    api.post<SanctuaryScene>(`/sanctuary/items/${id}/customize`, { slot, option }),
  // Move an owned item to a grid cell (layout only — never affects the economy). Swaps
  // with whatever item already occupies the target cell.
  move: (id: string, cell: number) =>
    api.post<SanctuaryScene>(`/sanctuary/items/${id}/move`, { cell }),
}

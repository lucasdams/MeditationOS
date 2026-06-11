import { api } from './api'
import type { SanctuaryScene } from '../types'

export const sanctuaryService = {
  getScene: () => api.get<SanctuaryScene>('/sanctuary'),
  plantNext: (itemKey: string) =>
    api.post<SanctuaryScene>('/sanctuary/plantings', { item_key: itemKey }),
}

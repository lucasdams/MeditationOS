import { api } from './api'
import type { SpiritState } from '../types'

// The Spirit read API (docs/design/spirit.md, ADR-0022). Step 2 consumes the read endpoint
// only — the active spirit's computed state (stage, path, bond, glow, coins, cosmetics).
// Mirrors sanctuaryService: a thin wrapper over the shared `api` fetch helper.
export const spiritService = {
  get: () => api.get<SpiritState>('/spirit'),
}

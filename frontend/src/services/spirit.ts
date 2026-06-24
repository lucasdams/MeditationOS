import { api } from './api'
import type {
  SpiritChooseRequest,
  SpiritCosmeticRequest,
  SpiritRenameRequest,
  SpiritState,
} from '../types'

// The Spirit API (docs/design/spirit.md, ADR-0022, ADR-0023). The read endpoint returns the
// active spirit's computed state plus the cosmetics catalog (`available`) and the retired
// `collection`; the writes choose the creature once, buy a cosmetic, rename the spirit, and
// awaken a new spark. Thin wrappers over the shared `api` fetch helper. Every call returns the
// fresh SpiritState, so callers can just swap in the response (refetch-free).
export const spiritService = {
  get: () => api.get<SpiritState>('/spirit'),
  // Choose the active creature once (ADR-0023). Only settable while the spirit is pathless; a
  // re-choose is rejected (409), an unknown path (422). Returns the spirit with its new path.
  choose: (body: SpiritChooseRequest) =>
    api.post<SpiritState>('/spirit/choose', body),
  // Buy/apply a cosmetic (slot → option) to the active spirit. The cost is deducted from the
  // derived coin balance; a within-slot swap charges only the difference. The server returns
  // the updated state. Unknown slot/option → 404; locked / unaffordable / already-applied → 409.
  buyCosmetic: (body: SpiritCosmeticRequest) =>
    api.post<SpiritState>('/spirit/cosmetics', body),
  // Set or clear the spirit's nickname (cosmetic; never changes coins). An empty/whitespace/
  // null name clears it; over-length → 422.
  rename: (body: SpiritRenameRequest) => api.patch<SpiritState>('/spirit', body),
  // Retire the active radiant spirit and awaken a fresh pathless spark. Requires the active
  // spirit to be at radiant — otherwise 409.
  awaken: () => api.post<SpiritState>('/spirit/awaken'),
}

import { api } from './api'
import type {
  SpiritChooseRequest,
  SpiritCosmeticRequest,
  SpiritResetNameRequest,
  SpiritState,
} from '../types'

// The Spirit API (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024). The read endpoint
// returns the active spirit's computed state plus the cosmetics catalog (`available`) and the
// retired `collection`; the writes choose the creature + name once, buy a cosmetic, reset the
// name or all upgrades (each a paid action, ADR-0024), and awaken a new spark. Thin wrappers
// over the shared `api` fetch helper. Every call returns the fresh SpiritState, so callers can
// just swap in the response (refetch-free).
export const spiritService = {
  get: () => api.get<SpiritState>('/spirit'),
  // Choose the active creature + name it once (ADR-0023 / ADR-0024). Only settable while the
  // spirit is pathless; a re-choose is rejected (409), an unknown path or blank name (422).
  // Returns the spirit with its new path + name.
  choose: (body: SpiritChooseRequest) =>
    api.post<SpiritState>('/spirit/choose', body),
  // Buy/apply a cosmetic (slot → option) to the active spirit. The full cost is deducted from
  // the derived coin balance; the slot then LOCKS (ADR-0024). The server returns the updated
  // state. Unknown slot/option → 404; locked-slot / not-unlocked / unaffordable → 409.
  buyCosmetic: (body: SpiritCosmeticRequest) =>
    api.post<SpiritState>('/spirit/cosmetics', body),
  // Change the spirit's name via a PAID reset (ADR-0024). The name is otherwise immutable.
  // Charges a flat fee — too few coins → 409; blank/over-length name → 422.
  resetName: (body: SpiritResetNameRequest) =>
    api.post<SpiritState>('/spirit/reset-name', body),
  // Clear ALL applied upgrades via a PAID reset (ADR-0024), unlocking every slot. Charges a
  // flat fee with no refund — too few coins → 409; nothing applied → 409.
  resetCosmetics: () => api.post<SpiritState>('/spirit/reset-upgrades'),
  // Retire the active radiant spirit and awaken a fresh pathless spark. Requires the active
  // spirit to be at radiant — otherwise 409.
  awaken: () => api.post<SpiritState>('/spirit/awaken'),
}

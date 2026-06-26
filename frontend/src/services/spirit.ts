import { api } from './api'
import type {
  SpiritChooseRequest,
  SpiritEquipRequest,
  SpiritPreview,
  SpiritResetNameRequest,
  SpiritState,
  SpiritUnlockRequest,
} from '../types'

// The Spirit API (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024, ADR-0027). The read
// endpoint returns the active spirit's computed state plus the cosmetics skill tree
// (`available`) and the retired `collection`; the writes choose the creature + name once, UNLOCK
// a cosmetic into the owned collection (a paid action that auto-equips, ADR-0027), EQUIP/clear an
// owned option for free, reset the name (paid, ADR-0024), and awaken a new spark. Thin wrappers
// over the shared `api` fetch helper. Every call returns the fresh SpiritState, so callers can
// just swap in the response (refetch-free).
export const spiritService = {
  get: () => api.get<SpiritState>('/spirit'),
  // The read-only skill-tree PREVIEW for all three creatures (ADR-0027), keyed by path — what
  // each one grows into (slots × tiered options, with the path's own exclusive capstones flagged).
  // Static catalog data; the choose page fetches it once to preview before the user picks.
  preview: () => api.get<SpiritPreview>('/spirit/preview'),
  // Choose the active creature + name it once (ADR-0023 / ADR-0024). Only settable while the
  // spirit is pathless; a re-choose is rejected (409), an unknown path or blank name (422).
  // Returns the spirit with its new path + name.
  choose: (body: SpiritChooseRequest) =>
    api.post<SpiritState>('/spirit/choose', body),
  // Unlock a cosmetic (slot → option) into the spirit's owned collection and auto-equip it
  // (ADR-0027). The full cost is deducted from the derived coin balance and added to the spend
  // ledger (owned forever, never refunded). Unknown slot/option → 404; already owned /
  // level-locked / tier-prereq unmet / unaffordable → 409. Returns the updated state.
  unlock: (body: SpiritUnlockRequest) =>
    api.post<SpiritState>('/spirit/cosmetics', body),
  // Equip an OWNED cosmetic option into its slot, or clear the slot with a null `option`
  // (ADR-0027) — FREE and instant. Unknown slot / option not in slot → 404; not owned → 409.
  // Returns the updated state.
  equip: (body: SpiritEquipRequest) =>
    api.post<SpiritState>('/spirit/cosmetics/equip', body),
  // Change the spirit's name via a PAID reset (ADR-0024). The name is otherwise immutable.
  // Charges a flat fee — too few coins → 409; blank/over-length name → 422.
  resetName: (body: SpiritResetNameRequest) =>
    api.post<SpiritState>('/spirit/reset-name', body),
  // Retire the active radiant spirit and awaken a fresh pathless spark. Requires the active
  // spirit to be at radiant — otherwise 409.
  awaken: () => api.post<SpiritState>('/spirit/awaken'),
}

// Shared spirit-needs helpers.
//
// The companion's "weakest need" — the lowest 0..1 factor of the three gentle needs
// (nourished / rested / joyful) — is what it needs MOST right now. Both the header
// reminder chip (AppHeader) and the Practices hub highlight derive from it, so the
// logic (including the tie-break) lives here ONCE to keep them in lock-step and
// matching the backend's "overall condition = weakest need" (ADR-0023/0031).
//
// NOTE: SpiritCondition carries only { tier, factor } — it does NOT name which need
// is weakest — so we can't read the key off it; we recompute from the three needs.
import type { SpiritNeedKey, SpiritNeeds } from '../types'

// Fixed evaluation order. reduce keeps the current best on a strict-`<` comparison,
// so on a tie the EARLIER key in this list wins (nourished > rested > joyful). This
// preserves the exact tie-break both call sites used before centralising.
const NEED_ORDER: SpiritNeedKey[] = ['nourished', 'rested', 'joyful']

/**
 * The weakest of the three needs (lowest `factor`) — what the companion needs most.
 * Ties resolve to the earlier need in NEED_ORDER (nourished, then rested, then joyful).
 */
export function weakestNeed(needs: SpiritNeeds): SpiritNeedKey {
  return NEED_ORDER.reduce((a, b) => (needs[b].factor < needs[a].factor ? b : a))
}

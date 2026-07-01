// Shared spirit-balance helpers (ADR-0032 "Vitality + Balance").
//
// The three needs (nourished / rested / joyful) are no longer depleting debts — they are an
// informational BALANCE of your recent practice mix. The overall look is driven by VITALITY
// (fed by any practice), not the weakest need. So the only thing we surface off the three is a
// gentle, optional "round-out" invitation for the LEAST-represented facet — and only when the
// balance is actually uneven. Both the header chip (AppHeader) and the Practices hub derive
// from the same helper here, so they stay in lock-step (including the tie-break + the
// even-balance rule).
import type { SpiritNeedKey, SpiritNeeds } from '../types'

// Fixed evaluation order. On a tie the EARLIER key wins (nourished > rested > joyful) — a stable,
// deterministic pick shared by both call sites.
const NEED_ORDER: SpiritNeedKey[] = ['nourished', 'rested', 'joyful']

// How close the facets must be to count as "balanced" (no round-out hint). If the gap between the
// lowest and highest facet is within this delta, the mix is even enough that we show nothing — the
// suggestion should only appear when one facet is genuinely lagging, and stay easy to ignore.
export const BALANCE_EVEN_DELTA = 0.1

/**
 * The least-represented facet (lowest `factor`) — the one a round-out practice would top up.
 * Ties resolve to the earlier facet in NEED_ORDER (nourished, then rested, then joyful).
 */
export function leastRepresentedFacet(needs: SpiritNeeds): SpiritNeedKey {
  return NEED_ORDER.reduce((a, b) => (needs[b].factor < needs[a].factor ? b : a))
}

/**
 * The facet worth gently suggesting a practitioner "round out", or `null` when the balance is even
 * (every facet within BALANCE_EVEN_DELTA of the highest). Null → show no suggestion at all. This is
 * the single source of truth for the header chip + the hub highlight under ADR-0032: an optional
 * invitation, never a "wants / needs" demand.
 */
export function roundOutFacet(needs: SpiritNeeds): SpiritNeedKey | null {
  const values = NEED_ORDER.map((k) => needs[k].factor)
  const spread = Math.max(...values) - Math.min(...values)
  if (spread <= BALANCE_EVEN_DELTA) return null
  return leastRepresentedFacet(needs)
}

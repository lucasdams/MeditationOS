// In-session guided cue overlay. Shows the current phase cue text (large,
// calm, low-contrast) and — depending on `speechOn` — either speaks each cue
// aloud or rings the existing soft bell on phase transitions.
//
// This component derives the active phase purely from `elapsed` and
// `durationSec` — it shares the same elapsed-time clock as the timer rather
// than forking a second interval.
//
// Audio behaviour:
// - Spoken guidance ON (toggle on AND a usable TTS voice exists): each cue is
//   read aloud in a calm, slowed voice as it appears. The voice REPLACES the
//   transition bell — no bell fires while speaking.
// - Spoken guidance OFF / unavailable: fall back to the prior behaviour — a soft
//   bell rings on phase transitions so guidance is never silent.
// In both cases the on-screen cue text stays (visual aid + fallback).
//
// Speech is only ever started after the session Start gesture (the page only
// mounts this component once a sit is underway), and is cancelled on pause /
// finish / unmount so no speech leaks after the user navigates away.
//
// Reduced-motion: no entrance animation when prefers-reduced-motion is set.

import { useEffect, useRef } from 'react'
import {
  buildSchedule,
  currentPhaseIndex,
  tryGetStructure,
  type GuidedStructureId,
  type PhaseWindow,
} from '../lib/guidedSessions'
import { playBell } from '../lib/sfx'
import { speak, cancelSpeech } from '../lib/speech'

// The seven chakras, base → crown, in their conventional colours. Used only by the
// Chakra Om practice to draw a small ascending column beside the cues.
const CHAKRA_COLOURS = [
  '#e0383a', // root — red
  '#e8742a', // sacral — orange
  '#e8c14a', // solar plexus — yellow
  '#3fae62', // heart — green
  '#2f7fe0', // throat — blue
  '#3f4fb0', // third eye — indigo
  '#8a4fd0', // crown — violet
] as const

// In the chakra-om structure the seven chakra phases are indices 2..8 (after the
// settle + intro-Om phases). Map the active phase to a chakra index, or null when
// the current phase isn't a chakra one (settle / intro / rest / close).
const CHAKRA_FIRST_PHASE = 2
function activeChakraIndex(phaseIdx: number): number | null {
  const i = phaseIdx - CHAKRA_FIRST_PHASE
  return i >= 0 && i < CHAKRA_COLOURS.length ? i : null
}

interface GuidedCuesProps {
  structureId: GuidedStructureId
  /** Current elapsed seconds, updated frequently (every ~250 ms from the timer). */
  elapsed: number
  /** Target session length in seconds. 0 = open-ended (uses 20-min reference). */
  durationSec: number
  /** Current bell volume (0–1), forwarded from the page's volume state. */
  volume: number
  /** Whether bells are enabled. If false, phase-transition bells are suppressed. */
  bellsOn: boolean
  /**
   * Spoken guidance is active: the page has the toggle ON and a usable TTS voice
   * exists. When true the voice reads each cue and the transition bell is
   * suppressed; when false we fall back to the bell.
   */
  speechOn: boolean
}

export default function GuidedCues({
  structureId,
  elapsed,
  durationSec,
  volume,
  bellsOn,
  speechOn,
}: GuidedCuesProps) {
  // Resolve the structure WITHOUT throwing: an unknown id (shouldn't happen — the
  // caller validates upstream) renders nothing rather than crashing the whole tree
  // mid-render. All hooks below run unconditionally (see the early return after them).
  const structure = tryGetStructure(structureId)

  // Build the schedule once per (structureId, durationSec) pair. durationSec
  // is locked at start time and won't change mid-sit, so this is stable.
  const scheduleRef = useRef<PhaseWindow[]>([])
  const scheduleKeyRef = useRef('')
  const scheduleKey = `${structureId}:${durationSec}`
  if (structure && scheduleKeyRef.current !== scheduleKey) {
    scheduleKeyRef.current = scheduleKey
    scheduleRef.current = buildSchedule(structure, durationSec)
  }

  const schedule = scheduleRef.current
  // Open-ended sits (durationSec === 0) cycle the schedule rather than parking on
  // the closing phase once they pass the 20-minute reference window.
  const loop = durationSec === 0
  const phaseIdx = currentPhaseIndex(schedule, elapsed, loop)
  const phase = structure?.phases[phaseIdx]

  // Latest speechOn in a ref so the per-phase effect reads the current value
  // without re-firing on toggle changes (it only acts on phase transitions).
  const speechOnRef = useRef(speechOn)
  useEffect(() => {
    speechOnRef.current = speechOn
  }, [speechOn])

  // Drive the per-phase audio cue. On each phase change:
  // - Spoken guidance on  → speak the new cue (no bell).
  // - Spoken guidance off → ring the bell if the phase asks for one.
  // The very first phase (lastPhaseIdxRef === -1) is spoken but not belled — the
  // page already rings an opening bell on Start, matching the prior behaviour.
  //
  // Open-ended (looping) sits wrap the schedule back to phase 0 every ~20 min. That
  // wrap is a phase DECREASE (last → 0), not a genuine forward advance, so we do NOT
  // re-speak/re-bell it — otherwise the settle/"eyes close" opening cue would fire
  // again mid-sit. We only act on a FORWARD advance (phaseIdx > last); the visual
  // progress still cycles independently. Single-fire per genuine transition.
  const lastPhaseIdxRef = useRef(-1)
  useEffect(() => {
    const prev = lastPhaseIdxRef.current
    if (phaseIdx === prev) return
    const isFirst = prev === -1
    // A backwards move (only the loop wrap, last → 0) is not a real transition:
    // update the tracker but stay silent so the opening phase isn't re-announced.
    const isForward = isFirst || phaseIdx > prev
    lastPhaseIdxRef.current = phaseIdx
    if (!phase || !isForward) return

    if (speechOnRef.current) {
      speak(phase.cue)
    } else if (!isFirst && phase.bell && bellsOn) {
      try {
        playBell(volume)
      } catch {
        // audio unavailable — skip silently
      }
    }
  }, [phaseIdx, phase, bellsOn, volume])

  // Cancel any in-progress / queued speech when spoken guidance is turned off
  // mid-sit (e.g. the sit pauses, or a fallback kicks in) and on unmount /
  // leave-page, so no speech leaks after navigating away. When it turns back on
  // (resume), re-speak the current cue so the user isn't left in silence until the
  // next phase boundary.
  const prevSpeechOnRef = useRef(speechOn)
  useEffect(() => {
    const was = prevSpeechOnRef.current
    prevSpeechOnRef.current = speechOn
    if (!speechOn) {
      cancelSpeech()
    } else if (!was && phase) {
      // off → on: resume — re-speak the cue the user is currently in.
      speak(phase.cue)
    }
  }, [speechOn, phase])

  useEffect(() => {
    return () => cancelSpeech()
  }, [])

  // Unknown structure (structure == null) or no active phase → render nothing (the
  // page falls back to the plain timer). Guarding both narrows `structure` to
  // non-null for the JSX below.
  if (!structure || !phase) return null

  // Progress within the current phase (0..1) for the subtle progress indicator.
  // Wrap elapsed over the reference span for open-ended sits so the bar tracks the
  // cycling phase rather than pinning at 100% past the 20-minute reference.
  const totalSpan = schedule.length ? schedule[schedule.length - 1].endSec : 0
  const wrappedElapsed = loop && totalSpan > 0 ? elapsed % totalSpan : elapsed
  const window = schedule[phaseIdx]
  const windowDuration = window ? window.endSec - window.startSec : 1
  const progressInPhase = window
    ? Math.min(1, Math.max(0, (wrappedElapsed - window.startSec) / windowDuration))
    : 0

  // Phase number shown to user (1-based)
  const phaseNum = phaseIdx + 1
  const totalPhases = structure.phases.length

  // Chakra Om only: a small ascending column of 7 dots in the chakra colours, the
  // active one (per the current phase) highlighted. Purely visual + derived — no
  // extra clock or audio plumbing. null when the phase isn't a chakra phase.
  const chakraActive =
    structureId === 'chakra-om' ? activeChakraIndex(phaseIdx) : null

  return (
    <div className="guided-cues">
      {structureId === 'chakra-om' && (
        <div className="guided-chakras" aria-hidden="true">
          {/* Rendered top (crown) → bottom (root) so the column reads base-up visually. */}
          {[...CHAKRA_COLOURS]
            .map((colour, i) => ({ colour, i }))
            .reverse()
            .map(({ colour, i }) => (
              <span
                key={i}
                className={`guided-chakra-dot${chakraActive === i ? ' guided-chakra-dot--active' : ''}`}
                style={{ ['--chakra-colour' as string]: colour }}
              />
            ))}
        </div>
      )}
      <div aria-live="polite" aria-atomic="true">
        <p className="guided-cues-text">{phase.cue}</p>
      </div>
      <div className="guided-cues-footer" aria-hidden="true">
        <span className="guided-cues-progress-label">
          {phaseNum} / {totalPhases}
        </span>
        <div
          className="guided-cues-bar"
          role="progressbar"
          aria-valuenow={Math.round(progressInPhase * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="guided-cues-bar-fill"
            style={{ width: `${progressInPhase * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

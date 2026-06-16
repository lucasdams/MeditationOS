// In-session guided cue overlay. Shows the current phase cue text (large,
// calm, low-contrast) and rings the existing soft bell on phase transitions.
//
// This component derives the active phase purely from `elapsed` and
// `durationSec` — it shares the same elapsed-time clock as the timer rather
// than forking a second interval.
//
// Design constraints:
// - No narrated audio. The bell on transition is the only sound.
// - Low-contrast, non-intrusive: the text sits gently over the session UI.
// - Reduced-motion: no entrance animation when prefers-reduced-motion is set.

import { useEffect, useRef } from 'react'
import {
  buildSchedule,
  currentPhaseIndex,
  getStructure,
  type GuidedStructureId,
  type PhaseWindow,
} from '../lib/guidedSessions'
import { playBell } from '../lib/sfx'

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
}

export default function GuidedCues({
  structureId,
  elapsed,
  durationSec,
  volume,
  bellsOn,
}: GuidedCuesProps) {
  const structure = getStructure(structureId)

  // Build the schedule once per (structureId, durationSec) pair. durationSec
  // is locked at start time and won't change mid-sit, so this is stable.
  const scheduleRef = useRef<PhaseWindow[]>([])
  const scheduleKeyRef = useRef('')
  const scheduleKey = `${structureId}:${durationSec}`
  if (scheduleKeyRef.current !== scheduleKey) {
    scheduleKeyRef.current = scheduleKey
    scheduleRef.current = buildSchedule(structure, durationSec)
  }

  const schedule = scheduleRef.current
  const phaseIdx = currentPhaseIndex(schedule, elapsed)
  const phase = structure.phases[phaseIdx]

  // Track the last phase seen so we can ring the bell on transitions.
  const lastPhaseIdxRef = useRef(-1)
  useEffect(() => {
    if (phaseIdx !== lastPhaseIdxRef.current) {
      if (lastPhaseIdxRef.current !== -1 && phase?.bell && bellsOn) {
        try {
          playBell(volume)
        } catch {
          // audio unavailable — skip silently
        }
      }
      lastPhaseIdxRef.current = phaseIdx
    }
  }, [phaseIdx, phase?.bell, bellsOn, volume])

  if (!phase) return null

  // Progress within the current phase (0..1) for the subtle progress indicator.
  const window = schedule[phaseIdx]
  const windowDuration = window ? window.endSec - window.startSec : 1
  const progressInPhase = window
    ? Math.min(1, Math.max(0, (elapsed - window.startSec) / windowDuration))
    : 0

  // Phase number shown to user (1-based)
  const phaseNum = phaseIdx + 1
  const totalPhases = structure.phases.length

  return (
    <div className="guided-cues" aria-live="polite" aria-atomic="true">
      <p className="guided-cues-text">{phase.cue}</p>
      <div className="guided-cues-footer">
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

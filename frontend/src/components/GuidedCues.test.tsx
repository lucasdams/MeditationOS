/**
 * Tests for GuidedCues' audio behaviour across the spoken-guidance vs bell paths.
 *
 * The actual TTS output and the Web Audio bell can't run in jsdom, so both the
 * `speech` and `sfx` modules are mocked. We assert the BRANCHING that the feature
 * hinges on:
 *  - spoken guidance ON  → each phase transition speaks the cue, NO bell.
 *  - spoken guidance OFF → phase transitions ring the bell (the prior fallback),
 *    NO speech.
 *  - the cue text always renders on screen (visual aid + fallback).
 *  - speech is cancelled when spoken guidance turns off (pause) and on unmount.
 *  - resume (off → on) re-speaks the current cue.
 *
 * We drive phase changes by advancing `elapsed` past phase boundaries derived from
 * the real schedule, so the test exercises the real phase-transition logic.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { buildSchedule, getStructure } from '../lib/guidedSessions'

const playBell = vi.fn()
const speak = vi.fn()
const cancelSpeech = vi.fn()

vi.mock('../lib/sfx', () => ({ playBell: (...a: unknown[]) => playBell(...a) }))
vi.mock('../lib/speech', () => ({
  speak: (...a: unknown[]) => speak(...a),
  cancelSpeech: (...a: unknown[]) => cancelSpeech(...a),
}))

import GuidedCues from './GuidedCues'

const DURATION = 600 // 10 min
const structure = getStructure('body-scan')
const schedule = buildSchedule(structure, DURATION)

// The elapsed-second midpoint of a phase window — safely "inside" that phase.
function midOfPhase(i: number): number {
  const w = schedule[i]
  return (w.startSec + w.endSec) / 2
}

// Find the first phase index > 0 whose phase carries a bell, so the fallback path
// has something to ring.
const bellPhaseIdx = structure.phases.findIndex((p, i) => i > 0 && p.bell)

afterEach(() => {
  cleanup()
  playBell.mockClear()
  speak.mockClear()
  cancelSpeech.mockClear()
})

function renderAt(elapsed: number, speechOn: boolean) {
  return render(
    <GuidedCues
      structureId="body-scan"
      elapsed={elapsed}
      durationSec={DURATION}
      volume={0.6}
      bellsOn
      speechOn={speechOn}
    />,
  )
}

describe('GuidedCues — spoken guidance ON', () => {
  it('speaks each cue on phase transition and never rings the bell', () => {
    const { rerender } = renderAt(midOfPhase(0), true)
    // First phase is spoken on mount (the page rings its own opening bell).
    expect(speak).toHaveBeenCalledTimes(1)
    expect(playBell).not.toHaveBeenCalled()

    // Advance into a bell-carrying phase: spoken, still no bell.
    rerender(
      <GuidedCues
        structureId="body-scan"
        elapsed={midOfPhase(bellPhaseIdx)}
        durationSec={DURATION}
        volume={0.6}
        bellsOn
        speechOn
      />,
    )
    expect(speak).toHaveBeenCalledTimes(2)
    expect(playBell).not.toHaveBeenCalled()
  })

  it('renders the current cue text on screen', () => {
    const { container } = renderAt(midOfPhase(2), true)
    expect(container.querySelector('.guided-cues-text')?.textContent).toBe(
      structure.phases[2].cue,
    )
  })
})

describe('GuidedCues — fallback (spoken guidance OFF)', () => {
  it('rings the bell on a bell phase transition and never speaks', () => {
    const { rerender } = renderAt(midOfPhase(0), false)
    expect(speak).not.toHaveBeenCalled()
    expect(playBell).not.toHaveBeenCalled() // first phase: no transition bell

    rerender(
      <GuidedCues
        structureId="body-scan"
        elapsed={midOfPhase(bellPhaseIdx)}
        durationSec={DURATION}
        volume={0.6}
        bellsOn
        speechOn={false}
      />,
    )
    expect(playBell).toHaveBeenCalledTimes(1)
    expect(speak).not.toHaveBeenCalled()
  })

  it('still renders the cue text on screen', () => {
    const { container } = renderAt(midOfPhase(0), false)
    expect(container.querySelector('.guided-cues-text')?.textContent).toBe(
      structure.phases[0].cue,
    )
  })
})

describe('GuidedCues — speech lifecycle', () => {
  it('cancels speech when spoken guidance turns off (pause)', () => {
    const { rerender } = renderAt(midOfPhase(1), true)
    cancelSpeech.mockClear()
    rerender(
      <GuidedCues
        structureId="body-scan"
        elapsed={midOfPhase(1)}
        durationSec={DURATION}
        volume={0.6}
        bellsOn
        speechOn={false}
      />,
    )
    expect(cancelSpeech).toHaveBeenCalled()
  })

  it('re-speaks the current cue when spoken guidance turns back on (resume)', () => {
    const { rerender } = renderAt(midOfPhase(2), false)
    speak.mockClear()
    rerender(
      <GuidedCues
        structureId="body-scan"
        elapsed={midOfPhase(2)}
        durationSec={DURATION}
        volume={0.6}
        bellsOn
        speechOn
      />,
    )
    expect(speak).toHaveBeenCalledWith(structure.phases[2].cue)
  })

  it('cancels speech on unmount', () => {
    const { unmount } = renderAt(midOfPhase(1), true)
    cancelSpeech.mockClear()
    unmount()
    expect(cancelSpeech).toHaveBeenCalled()
  })
})

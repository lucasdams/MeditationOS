/**
 * Tests for SoundscapePicker's preview-on-select behaviour.
 *
 * When a shared `previewEngineRef` is supplied and `previewEnabled` is true, selecting
 * a soundscape must immediately preview it via the engine, switching swaps it, "Silent"
 * stops it, and the volume slider updates the live preview level. When previewing is off
 * (a session owns the audio) selecting must NOT touch the engine. Crucially, the engine
 * the preview populates is the SAME ref the page reuses on Start — so the session reuses
 * the already-playing preview instead of stacking a second engine (no double-play).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'

// One shared mock engine instance per test so we can assert on its calls. The mocked
// SoundscapeEngine constructor always returns this instance, mirroring "one engine".
const engineCalls = {
  start: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
}

vi.mock('../lib/soundscapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/soundscapes')>()
  // A real (non-arrow) function so it can be invoked with `new`; it returns the shared
  // call-recording stub so every `new SoundscapeEngine()` resolves to the same instance.
  const MockEngine = vi.fn(function MockEngine(this: unknown) {
    return engineCalls
  })
  return { ...actual, SoundscapeEngine: MockEngine }
})

import SoundscapePicker from './SoundscapePicker'
import { SoundscapeEngine, type SoundscapeName } from '../lib/soundscapes'

// A tiny harness that owns the shared engine ref (as the page does) and exposes its
// current value so a test can simulate the page's "Start" hand-off.
function Harness({
  previewEnabled = true,
  initial = 'silent' as SoundscapeName,
}: {
  previewEnabled?: boolean
  initial?: SoundscapeName
}) {
  const engineRef = useRef<InstanceType<typeof SoundscapeEngine> | null>(null)
  // State (not a ref) so the `value` prop updates and the volume slider — only shown
  // for a non-silent selection — appears after a chip is picked, as on the real page.
  const [value, setValue] = useState<SoundscapeName>(initial)
  const [volume, setVolume] = useState(0.4)
  return (
    <SoundscapePicker
      value={value}
      volume={volume}
      previewEngineRef={engineRef}
      previewEnabled={previewEnabled}
      onSoundscapeChange={setValue}
      onVolumeChange={setVolume}
    />
  )
}

function clickChip(label: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: label }))
}

describe('SoundscapePicker — preview on select', () => {
  beforeEach(() => {
    engineCalls.start.mockReset()
    engineCalls.stop.mockReset()
    engineCalls.setVolume.mockReset()
    ;(SoundscapeEngine as unknown as ReturnType<typeof vi.fn>).mockClear()
  })
  afterEach(cleanup)

  it('plays a preview immediately when a soundscape is selected', () => {
    render(<Harness />)
    clickChip(/^ocean$/i)
    expect(engineCalls.start).toHaveBeenCalledWith('ocean', 0.4)
  })

  it('switching to another soundscape restarts the preview with the new choice', () => {
    render(<Harness />)
    clickChip(/^ocean$/i)
    clickChip(/^rain$/i)
    // The engine's own start() handles the swap (it stops the prior internally), so we
    // assert the latest start is for the new soundscape — and only ONE engine was made.
    expect(engineCalls.start).toHaveBeenLastCalledWith('rain', 0.4)
    expect(SoundscapeEngine).toHaveBeenCalledTimes(1)
  })

  it('selecting Silent stops the preview', () => {
    render(<Harness />)
    clickChip(/^ocean$/i)
    clickChip(/^silent$/i)
    expect(engineCalls.stop).toHaveBeenCalled()
  })

  it('the volume slider updates the live preview level', () => {
    render(<Harness />)
    clickChip(/^ocean$/i)
    const slider = screen.getByLabelText(/soundscape volume/i)
    fireEvent.change(slider, { target: { value: '0.8' } })
    expect(engineCalls.setVolume).toHaveBeenCalledWith(0.8)
  })

  it('does NOT preview when previewing is disabled (a session owns the audio)', () => {
    render(<Harness previewEnabled={false} />)
    clickChip(/^ocean$/i)
    expect(engineCalls.start).not.toHaveBeenCalled()
    expect(SoundscapeEngine).not.toHaveBeenCalled()
  })

  it('does NOT preview when no engine ref is supplied', () => {
    render(
      <SoundscapePicker
        value="silent"
        volume={0.4}
        onSoundscapeChange={() => {}}
        onVolumeChange={() => {}}
      />,
    )
    clickChip(/^ocean$/i)
    expect(SoundscapeEngine).not.toHaveBeenCalled()
  })

  it('reuses a single engine across previews — no second engine stacked', () => {
    render(<Harness />)
    clickChip(/^ocean$/i)
    clickChip(/^rain$/i)
    clickChip(/^forest birds$/i)
    // Three selections, still exactly one engine instance (the page reuses this same
    // engine on Start, so the session never stacks a second playback).
    expect(SoundscapeEngine).toHaveBeenCalledTimes(1)
  })
})

import { useEffect, useRef } from 'react'
import {
  SOUNDSCAPES,
  SoundscapeEngine,
  saveSoundscapePref,
  type SoundscapeName,
} from '../lib/soundscapes'

interface Props {
  value: SoundscapeName
  volume: number
  disabled?: boolean
  onSoundscapeChange: (name: SoundscapeName) => void
  onVolumeChange: (vol: number) => void
  /**
   * Optional shared engine ref. When provided together with `previewEnabled`, the
   * picker previews the chosen soundscape immediately on click (before any session
   * starts): selecting one plays it, selecting a different one switches it, "Silent"
   * stops it, and the volume slider updates it live. Passing the page's own engine ref
   * lets a started session reuse the already-playing preview — one engine, no
   * double-play. The page owns unmount teardown (it holds the same ref).
   */
  previewEngineRef?: React.MutableRefObject<SoundscapeEngine | null>
  /**
   * Whether the picker may drive preview playback right now. Pass `false` while a
   * session owns the audio (running/paused) so the picker doesn't fight the session —
   * the parent handles live switching during a sit. Defaults to `true`.
   */
  previewEnabled?: boolean
}

export default function SoundscapePicker({
  value,
  volume,
  disabled = false,
  onSoundscapeChange,
  onVolumeChange,
  previewEngineRef,
  previewEnabled = true,
}: Props) {
  // Latest volume in a ref so a fresh preview starts at the current level without
  // re-running effects on every slider tick.
  const volumeRef = useRef(volume)
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  const canPreview = !!previewEngineRef && previewEnabled

  function handleSelect(name: SoundscapeName) {
    saveSoundscapePref(name)
    onSoundscapeChange(name)

    // Preview on this user gesture (a click is a valid Web Audio unlock gesture).
    if (canPreview && previewEngineRef) {
      if (name === 'silent') {
        previewEngineRef.current?.stop()
      } else {
        if (!previewEngineRef.current) previewEngineRef.current = new SoundscapeEngine()
        previewEngineRef.current.start(name, volumeRef.current)
      }
    }
  }

  function handleVolume(vol: number) {
    onVolumeChange(vol)
    if (canPreview) previewEngineRef?.current?.setVolume(vol)
  }

  return (
    <div className="soundscape-picker">
      <div className="soundscape-chips" role="group" aria-label="Ambient soundscape">
        {SOUNDSCAPES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`selectable soundscape-chip${value === s.value ? ' selected' : ''}`}
            aria-pressed={value === s.value}
            disabled={disabled}
            onClick={() => handleSelect(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {value !== 'silent' && (
        <input
          className="breathe-volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          disabled={disabled}
          aria-label="Soundscape volume"
          onChange={(e) => handleVolume(Number(e.target.value))}
        />
      )}
    </div>
  )
}

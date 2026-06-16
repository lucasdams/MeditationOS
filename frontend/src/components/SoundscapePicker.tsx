import { SOUNDSCAPES, saveSoundscapePref, type SoundscapeName } from '../lib/soundscapes'

interface Props {
  value: SoundscapeName
  volume: number
  disabled?: boolean
  onSoundscapeChange: (name: SoundscapeName) => void
  onVolumeChange: (vol: number) => void
}

export default function SoundscapePicker({
  value,
  volume,
  disabled = false,
  onSoundscapeChange,
  onVolumeChange,
}: Props) {
  function handleSelect(name: SoundscapeName) {
    saveSoundscapePref(name)
    onSoundscapeChange(name)
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
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      )}
    </div>
  )
}

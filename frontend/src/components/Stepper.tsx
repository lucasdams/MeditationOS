// A horizontal "− value +" selector that steps left/right through a fixed list of
// options. Used for session duration and breathing pace, where a slider/dropdown
// felt heavier than a single tap to the next increment. Options can carry uneven
// increments (e.g. 5, 10, 20, 45 min) — stepping just moves to the neighbouring
// entry, so the gaps need not be regular. Each step plays a soft tactile tick.

import { playClick } from '../lib/sfx'

export type StepperOption<T extends string | number> = { value: T; label: string }

interface StepperProps<T extends string | number> {
  options: StepperOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel?: string
}

export default function Stepper<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: StepperProps<T>) {
  const index = options.findIndex((o) => o.value === value)
  const current = index >= 0 ? options[index] : options[0]
  const atStart = index <= 0
  const atEnd = index >= options.length - 1

  const go = (delta: number) => {
    const next = options[index + delta]
    if (next) {
      playClick() // soft tactile feedback on each step
      onChange(next.value)
    }
  }

  return (
    <div className="stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => go(-1)}
        disabled={disabled || atStart}
        aria-label="Previous"
      >
        −
      </button>
      <span className="stepper-value">{current?.label}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => go(1)}
        disabled={disabled || atEnd}
        aria-label="Next"
      >
        +
      </button>
    </div>
  )
}

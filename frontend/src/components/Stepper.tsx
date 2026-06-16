// A horizontal "− value +" selector that steps left/right through a fixed list of
// options. Used for session duration and breathing pace, where a slider/dropdown
// felt heavier than a single tap to the next increment. Options can carry uneven
// increments (e.g. 5, 10, 20, 45 min) — stepping just moves to the neighbouring
// entry, so the gaps need not be regular. Each step plays a soft tactile tick.

import type { ReactNode } from 'react'
import { playClick } from '../lib/sfx'

export type StepperOption<T extends string | number> = { value: T; label: string }

interface StepperProps<T extends string | number> {
  options: StepperOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel?: string
  // Optional captions under the − / + buttons, e.g. "Gentler" / "Harder" for pace,
  // so the direction of each button is self-explanatory. Also used as the button's
  // accessible label when present.
  prevLabel?: string
  nextLabel?: string
  // Optional node shown on the same line as the value (e.g. a difficulty badge), so
  // it's clearly tied to the current selection rather than floating nearby.
  valueSuffix?: ReactNode
}

export default function Stepper<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  prevLabel,
  nextLabel,
  valueSuffix,
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
      <div className="stepper-side">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => go(-1)}
          disabled={disabled || atStart}
          aria-label={prevLabel ?? 'Previous'}
        >
          −
        </button>
        {prevLabel && <span className="stepper-side-label">{prevLabel}</span>}
      </div>
      {/* aria-live announces the current value to screen readers when it changes. */}
      <span className="stepper-value" aria-live="polite" aria-atomic="true">
        {current?.label}
        {valueSuffix != null && <span className="stepper-value-suffix"> · {valueSuffix}</span>}
      </span>
      <div className="stepper-side">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => go(1)}
          disabled={disabled || atEnd}
          aria-label={nextLabel ?? 'Next'}
        >
          +
        </button>
        {nextLabel && <span className="stepper-side-label">{nextLabel}</span>}
      </div>
    </div>
  )
}

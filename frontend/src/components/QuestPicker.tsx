import { QUEST_FEATURES, MIN_QUEST_FEATURES } from '../types'

// Shared daily-quest feature picker used by both Onboarding and Settings so the
// two screens cannot drift in markup, toggle behaviour, or the minimum-pick rule.
// The host owns the selected list; this component renders the checkboxes and
// reports each toggle. `optionClassName` lets each screen keep its own layout
// class (onboarding-choice cards vs. settings-check rows).

type QuestPickerProps = {
  selected: string[]
  onToggle: (key: string, on: boolean) => void
  optionClassName?: string
  legend?: string
}

export const tooFewQuestsMessage = `Pick at least ${MIN_QUEST_FEATURES}.`

export default function QuestPicker({
  selected,
  onToggle,
  optionClassName = 'quest-option',
  legend,
}: QuestPickerProps) {
  return (
    <fieldset className="quest-picker">
      {legend && <legend className="sr-only">{legend}</legend>}
      {QUEST_FEATURES.map((f) => (
        <label key={f.key} className={optionClassName}>
          <input
            type="checkbox"
            checked={selected.includes(f.key)}
            onChange={(e) => onToggle(f.key, e.target.checked)}
          />{' '}
          {f.label}
        </label>
      ))}
    </fieldset>
  )
}

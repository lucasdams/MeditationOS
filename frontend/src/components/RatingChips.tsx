/**
 * A 1–5 rating chip row with a leading "not rated" chip, shared by the session
 * log, the post-sit reflection, and the timeline edit. The empty value is '' and
 * maps to the "not rated" chip; 1–5 are strings so the chip set is uniform.
 *
 * The "not rated" chip's label is caller-controlled (some places show "—", some
 * "Not rated") so existing copy is preserved exactly.
 */
export default function RatingChips({
  value,
  onChange,
  ariaLabel,
  notRatedLabel = 'Not rated',
}: {
  value: string
  onChange: (value: string) => void
  // Names the chip group for assistive tech (role="group").
  ariaLabel: string
  notRatedLabel?: string
}) {
  return (
    <div className="log-session-rating" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={`chip${value === '' ? ' chip-active' : ''}`}
        aria-pressed={value === ''}
        onClick={() => onChange('')}
      >
        {notRatedLabel}
      </button>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`chip${value === String(n) ? ' chip-active' : ''}`}
          aria-pressed={value === String(n)}
          aria-label={`Rate ${n} of 5`}
          onClick={() => onChange(String(n))}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

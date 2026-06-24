// Small shared formatting / time helpers, so the same byte-identical snippets
// aren't re-declared across pages and components.

// Milliseconds in a day.
export const DAY_MS = 86_400_000

// Seconds → "m:ss" (e.g. 75 → "1:15"). Clamps negatives to 0.
export const mmss = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// A Date → "YYYY-MM-DD" in local time (avoids a UTC off-by-one).
export const localYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

// A Date → the local "YYYY-MM-DDTHH:mm" value that an <input type="datetime-local">
// expects (the input is interpreted in the browser's local zone). Shared so the
// log/schedule/timeline pages don't each hand-roll a slightly different version.
export const toDatetimeLocal = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${localYMD(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

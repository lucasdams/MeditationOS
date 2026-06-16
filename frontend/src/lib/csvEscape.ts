// Prefix formula-trigger chars to prevent spreadsheet injection (CSV injection mitigation).
const CSV_FORMULA_RE = /^[=+\-@\t\r]/

export const csvEscape = (v: string): string => {
  const safe = CSV_FORMULA_RE.test(v) ? `'${v}` : v
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

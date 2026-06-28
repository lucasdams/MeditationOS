import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  dayPhaseFor,
  readSeasonPref,
  resolveSeason,
  writeSeasonPref,
  type DayPhase,
  type Season,
  type SeasonPref,
} from '../lib/theme'

interface ThemeValue {
  pref: SeasonPref
  setPref: (pref: SeasonPref) => void
  season: Season
  dayPhase: DayPhase
  now: Date
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined)

// How often we re-check the clock so the day phase (and an auto season) stay current
// without a reload. A minute is plenty for dawn/day/dusk/night boundaries.
const TICK_MS = 60_000

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<SeasonPref>(() => readSeasonPref())
  const [now, setNow] = useState(() => new Date())

  // Keep the clock fresh: tick every minute, and snap to the current time whenever
  // the tab regains focus (it may have been backgrounded across a phase boundary).
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const season = resolveSeason(pref, now)
  const dayPhase = dayPhaseFor(now)

  // Drive the CSS purely through data attributes on <html>. The app ships the
  // Warm Sanctuary LIGHT theme by default (a warm cream canvas); the warm-dark
  // palette stays in the stylesheet, ready behind a future Settings toggle.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = 'light'
    root.dataset.season = season
    root.dataset.dayphase = dayPhase
  }, [season, dayPhase])

  function setPref(next: SeasonPref) {
    setPrefState(next)
    writeSeasonPref(next)
  }

  const value = useMemo(
    () => ({ pref, setPref, season, dayPhase, now }),
    [pref, season, dayPhase, now],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

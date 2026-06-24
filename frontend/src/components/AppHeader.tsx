import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'

// Secondary destinations, tucked into the "More" menu. Each carries a per-destination
// accent (light + dark shades, mirroring the home tiles' TILE_COLORS pairs) so the menu
// items read as the app's soft colour-tinted pills, not plain text. icon + label are
// separate so the emoji can sit in a fixed-width gutter (labels line up cleanly).
type MoreLink = { to: string; icon: string; label: string; light: string; dark: string }

const MORE_LINKS: MoreLink[] = [
  { to: '/trataka', icon: '🕯️', label: 'Candle gazing', light: '#b45309', dark: '#f59e0b' },
  { to: '/sessions/new', icon: '➕', label: 'Log a session', light: '#0f766e', dark: '#14b8a6' },
  { to: '/timeline', icon: '🕒', label: 'Timeline', light: '#0369a1', dark: '#0ea5e9' },
  { to: '/goals', icon: '🎯', label: 'Goals', light: '#6d28d9', dark: '#a78bfa' },
  { to: '/schedule', icon: '🗓️', label: 'Schedule', light: '#1d4ed8', dark: '#60a5fa' },
  { to: '/spirit', icon: '🪷', label: 'Spirit', light: '#0e7490', dark: '#22d3ee' },
  { to: '/analytics', icon: '📈', label: 'Analytics', light: '#be185d', dark: '#f472b6' },
]

// The "More" links render in two sibling containers (desktop dropdown + mobile inline
// list), shown/hidden per breakpoint via CSS. Shared so the markup can't drift. NavLink
// adds an `active` class on the current route so the user can see where they are. The
// per-destination accent is passed as CSS vars; the CSS resolves light/dark per theme.
function renderMoreLink(l: MoreLink) {
  return (
    <NavLink
      key={l.to}
      to={l.to}
      className="nav-more-link"
      style={{ ['--more-fill' as string]: l.light, ['--more-fill-dark' as string]: l.dark }}
    >
      <span className="nav-more-icon" aria-hidden="true">{l.icon}</span>
      <span className="nav-more-label">{l.label}</span>
    </NavLink>
  )
}

export default function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [level, setLevel] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false) // mobile hamburger menu
  const moreRef = useRef<HTMLDivElement>(null)
  // The admin entry renders only for admins (is_admin from /auth/me). Non-admins never
  // see it; the backend also 403s every /admin/* call regardless of the UI.
  const moreLinks = user?.is_admin
    ? [...MORE_LINKS, { to: '/admin', icon: '🛠️', label: 'Admin', light: '#475569', dark: '#94a3b8' }]
    : MORE_LINKS

  // Refetch on every navigation so the level stays live after earning XP.
  useEffect(() => {
    let ignore = false
    dashboardService
      .getStats()
      .then((s) => { if (!ignore) setLevel(s.level) })
      .catch(() => {})
    return () => { ignore = true }
  }, [location.pathname])

  // Close the "More" menu and the mobile nav on navigation.
  useEffect(() => {
    setMoreOpen(false)
    setNavOpen(false)
  }, [location.pathname])

  // Close it on an outside click or Escape.
  useEffect(() => {
    if (!moreOpen) return
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="app-header">
      <Link to="/" className="app-brand">
        MeditationOS
      </Link>
      <button
        type="button"
        className="nav-toggle"
        aria-label="Menu"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((o) => !o)}
      >
        {navOpen ? '✕' : '☰'}
      </button>
      <nav className={`app-nav${navOpen ? ' open' : ''}`}>
        <Link to="/" className="nav-home">
          Home
        </Link>
        <Link to="/meditate" className="nav-meditate">
          🧘 Meditate
        </Link>
        <Link to="/breathe" className="nav-breathe">
          🫁 Breathe
        </Link>
        <Link to="/gratitude" className="nav-gratitude">
          🙏 Gratitude
        </Link>
        <Link to="/journal" className="nav-journal">
          📓 Journal
        </Link>

        <div className="nav-more" ref={moreRef}>
          {/* Drop role="menu"/role="menuitem" — these links aren't a widget menu and
              arrow-key navigation isn't implemented. Plain nav links are correct here.
              aria-controls ties the button to the nav region it expands. */}
          <button
            type="button"
            className="nav-more-btn"
            aria-haspopup="true"
            aria-expanded={moreOpen}
            aria-controls="nav-more-dropdown"
            onClick={() => setMoreOpen((o) => !o)}
          >
            More ▾
          </button>
          {moreOpen && (
            <div id="nav-more-dropdown" className="nav-more-menu">
              {moreLinks.map(renderMoreLink)}
            </div>
          )}
        </div>

        {/* On mobile the "More" dropdown is hidden; its links show inline in the menu. */}
        <div className="nav-mobile-extra">{moreLinks.map(renderMoreLink)}</div>
      </nav>
      <div className="app-user">
        <Link to="/settings" className="nav-settings" title="Account settings">
          <span aria-hidden="true">⚙️</span>
          <span>
            {user?.username}
            {level !== null && ` · Lv ${level}`}
          </span>
        </Link>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'

// Secondary destinations, tucked into the "More" menu.
const MORE_LINKS = [
  { to: '/trataka', label: '🕯️ Candle gazing' },
  { to: '/sessions/new', label: '➕ Log a session' },
  { to: '/timeline', label: '🕒 Timeline' },
  { to: '/goals', label: '🎯 Goals' },
  { to: '/schedule', label: '🗓️ Schedule' },
  { to: '/spirit', label: '🪷 Spirit' },
  { to: '/sanctuary', label: '🌱 Sanctuary' },
  { to: '/analytics', label: '📈 Analytics' },
]

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
    ? [...MORE_LINKS, { to: '/admin', label: '🛠️ Admin' }]
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
              {moreLinks.map((l) => (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* On mobile the "More" dropdown is hidden; its links show inline in the menu. */}
        <div className="nav-mobile-extra">
          {moreLinks.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </div>
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

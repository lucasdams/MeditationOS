import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'

// Secondary destinations, tucked into the "More" menu.
const MORE_LINKS = [
  { to: '/goals', label: '🎯 Goals' },
  { to: '/programs', label: '🧭 Programs' },
  { to: '/schedule', label: '🗓️ Schedule' },
  { to: '/sanctuary', label: '🌱 Sanctuary' },
  { to: '/analytics', label: '📈 Analytics' },
  { to: '/sessions', label: '📜 History' },
]

export default function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [level, setLevel] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  // Refetch on every navigation so the level stays live after earning XP.
  useEffect(() => {
    dashboardService
      .getStats()
      .then((s) => setLevel(s.level))
      .catch(() => {})
  }, [location.pathname])

  // Close the "More" menu on navigation.
  useEffect(() => setMoreOpen(false), [location.pathname])

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
      <nav className="app-nav">
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
        <Link to="/sessions/new" className="nav-log">
          + Log
        </Link>

        <div className="nav-more" ref={moreRef}>
          <button
            type="button"
            className="nav-more-btn"
            aria-haspopup="true"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            More ▾
          </button>
          {moreOpen && (
            <div className="nav-more-menu" role="menu">
              {MORE_LINKS.map((l) => (
                <Link key={l.to} to={l.to} role="menuitem">
                  {l.label}
                </Link>
              ))}
            </div>
          )}
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

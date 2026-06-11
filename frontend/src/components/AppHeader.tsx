import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [level, setLevel] = useState<number | null>(null)

  // Refetch on every navigation so the level stays live after earning XP.
  useEffect(() => {
    dashboardService
      .getStats()
      .then((s) => setLevel(s.level))
      .catch(() => {})
  }, [location.pathname])

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
        <Link to="/sanctuary" className="nav-sanctuary">
          🌱 Sanctuary
        </Link>
        <Link to="/sessions/new" className="nav-log">
          + Log
        </Link>
        <Link to="/sessions" className="nav-history">
          History
        </Link>
      </nav>
      <div className="app-user">
        <Link to="/settings" className="nav-settings" title="Settings">
          {user?.username}
          {level !== null && ` · Lv ${level}`}
        </Link>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}

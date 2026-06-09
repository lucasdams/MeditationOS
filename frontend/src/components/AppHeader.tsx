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
        <Link to="/breathe" className="primary">
          🫁 Breathe
        </Link>
        <Link to="/sessions/new">Log</Link>
        <Link to="/sessions">Sessions</Link>
      </nav>
      <div className="app-user">
        <span>
          {user?.username}
          {level !== null && ` · Lv ${level}`}
        </span>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}

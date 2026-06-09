import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <main className="dashboard">
      <header>
        <h1>MeditationOS</h1>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
      <nav className="dash-nav">
        <Link to="/sessions/new">+ Log a session</Link>
        <Link to="/sessions">View your sessions</Link>
      </nav>
    </main>
  )
}

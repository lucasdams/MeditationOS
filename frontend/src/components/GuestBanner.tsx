import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Shown to guest accounts: nudge them to claim the account before they lose it. */
export default function GuestBanner() {
  const { user } = useAuth()
  if (!user || !user.is_guest) return null

  return (
    <div className="guest-banner" role="status">
      <span>
        You&rsquo;re a guest — your progress lives only in this browser and is lost for
        good if cookies are cleared. Add an email so you don&rsquo;t lose it.
      </span>
      <Link to="/settings">Save my account →</Link>
    </div>
  )
}

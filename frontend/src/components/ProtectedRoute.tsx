import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from './AppHeader'
import VerifyEmailBanner from './VerifyEmailBanner'
import GuestBanner from './GuestBanner'
import ChooseUsername from '../pages/ChooseUsername'
import ChooseQuests from '../pages/ChooseQuests'
import LandingPage from '../pages/LandingPage'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="centered">Loading…</p>
  if (!user) {
    // The front door: logged-out visitors to "/" get the marketing landing page;
    // any other protected path sends them to log in.
    return location.pathname === '/' ? <LandingPage /> : <Navigate to="/login" replace />
  }
  if (!user.username) return <ChooseUsername />
  // First-run quest picker: null means the user hasn't chosen yet.
  if (user.quest_features == null) return <ChooseQuests />

  return (
    <>
      <AppHeader />
      <GuestBanner />
      <VerifyEmailBanner />
      <Outlet />
    </>
  )
}

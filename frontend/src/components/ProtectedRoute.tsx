import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from './AppHeader'
import VerifyEmailBanner from './VerifyEmailBanner'
import GuestBanner from './GuestBanner'
import ChooseUsername from '../pages/ChooseUsername'
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

  return (
    <>
      <AppHeader />
      <GuestBanner />
      <VerifyEmailBanner />
      <Outlet />
    </>
  )
}

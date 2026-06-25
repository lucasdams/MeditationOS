import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from './AppHeader'
import VerifyEmailBanner from './VerifyEmailBanner'
import ConfirmEmailGate from './ConfirmEmailGate'
import GuestBanner from './GuestBanner'
import ChooseUsername from '../pages/ChooseUsername'
import Onboarding from '../pages/Onboarding'
import LandingPage from '../pages/LandingPage'
import { Loading } from './StateViews'

export default function ProtectedRoute() {
  const { user, loading, verificationRequired } = useAuth()
  const location = useLocation()

  if (loading) return <Loading className="centered" />
  if (!user) {
    // The front door: logged-out visitors to "/" get the marketing landing page;
    // any other protected path sends them to log in.
    return location.pathname === '/' ? <LandingPage /> : <Navigate to="/login" replace />
  }
  // Hard gate: only engages once a 403 from a data route was confirmed against
  // /auth/me as an unverified account (verificationRequired). Off by default — while
  // the backend flag is off there are no 403s, so this never blocks anyone.
  if (verificationRequired) return <ConfirmEmailGate />
  if (!user.username) return <ChooseUsername />
  // First-run onboarding: quest_features null means the user hasn't been set up yet.
  if (user.quest_features == null) return <Onboarding />

  return (
    <>
      <AppHeader />
      <GuestBanner />
      <VerifyEmailBanner />
      <Outlet />
    </>
  )
}

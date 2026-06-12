import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from './AppHeader'
import VerifyEmailBanner from './VerifyEmailBanner'
import GuestBanner from './GuestBanner'
import ChooseUsername from '../pages/ChooseUsername'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="centered">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
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

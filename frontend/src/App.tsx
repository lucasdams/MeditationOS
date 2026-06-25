import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// --- Eagerly-loaded routes (auth flow + core dashboard hit on first paint) ---
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import DashboardPage from './pages/DashboardPage'
import BreathePage from './pages/BreathePage'
import MeditatePage from './pages/MeditatePage'
import GratitudePage from './pages/GratitudePage'
import JournalPage from './pages/JournalPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import NotFoundPage from './pages/NotFoundPage'
import ProtectedRoute from './components/ProtectedRoute'
import CookieNotice from './components/CookieNotice'
import ZenEgg from './components/ZenEgg'
import { Loading } from './components/StateViews'

// --- Lazily-loaded routes (heavy pages unlikely to be the first URL visited) ---
const TratakaPage     = lazy(() => import('./pages/TratakaPage'))
const LogSessionPage  = lazy(() => import('./pages/LogSessionPage'))
const LogReadingPage  = lazy(() => import('./pages/LogReadingPage'))
const TimelinePage    = lazy(() => import('./pages/TimelinePage'))
const GoalsPage       = lazy(() => import('./pages/GoalsPage'))
const AnalyticsPage   = lazy(() => import('./pages/AnalyticsPage'))
const SanctuaryPage   = lazy(() => import('./pages/SanctuaryPage'))
const SchedulePage    = lazy(() => import('./pages/SchedulePage'))
const SettingsPage    = lazy(() => import('./pages/SettingsPage'))
const AdminPage       = lazy(() => import('./pages/AdminPage'))

// A lightweight Suspense fallback that respects the app's dark/season theme via
// CSS custom properties (--text-muted is set by ThemeProvider on <html>).
function PageFallback() {
  return (
    <main id="main-content" style={{ padding: '2rem' }}>
      <Loading className="muted" />
    </main>
  )
}

export default function App() {
  return (
    <>
      {/* Skip-to-content link: visually hidden until focused so keyboard/SR users
          can bypass the repeated nav header on every page. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        {/* Public legal pages — reachable while logged out */}
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/breathe" element={<BreathePage />} />
          <Route path="/meditate" element={<MeditatePage />} />
          <Route
            path="/trataka"
            element={<Suspense fallback={<PageFallback />}><TratakaPage /></Suspense>}
          />
          <Route path="/gratitude" element={<GratitudePage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route
            path="/timeline"
            element={<Suspense fallback={<PageFallback />}><TimelinePage /></Suspense>}
          />
          <Route
            path="/goals"
            element={<Suspense fallback={<PageFallback />}><GoalsPage /></Suspense>}
          />
          <Route
            path="/analytics"
            element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>}
          />
          <Route
            path="/sanctuary"
            element={<Suspense fallback={<PageFallback />}><SanctuaryPage /></Suspense>}
          />
          <Route
            path="/schedule"
            element={<Suspense fallback={<PageFallback />}><SchedulePage /></Suspense>}
          />
          {/* History folded into Timeline; redirect old links/bookmarks. */}
          <Route path="/sessions" element={<Navigate to="/timeline" replace />} />
          <Route
            path="/sessions/new"
            element={<Suspense fallback={<PageFallback />}><LogSessionPage /></Suspense>}
          />
          <Route
            path="/biometrics/new"
            element={<Suspense fallback={<PageFallback />}><LogReadingPage /></Suspense>}
          />
          <Route
            path="/settings"
            element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>}
          />
          {/* Admin dashboard — AdminPage redirects non-admins to "/"; the backend
              independently 403s every /admin/* API call for non-admins. */}
          <Route
            path="/admin"
            element={<Suspense fallback={<PageFallback />}><AdminPage /></Suspense>}
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <CookieNotice />
      <ZenEgg />
    </>
  )
}

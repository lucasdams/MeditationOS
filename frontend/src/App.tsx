import { Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import LogSessionPage from './pages/LogSessionPage'
import HistoryPage from './pages/HistoryPage'
import BreathePage from './pages/BreathePage'
import MeditatePage from './pages/MeditatePage'
import GratitudePage from './pages/GratitudePage'
import SanctuaryPage from './pages/SanctuaryPage'
import SettingsPage from './pages/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/breathe" element={<BreathePage />} />
        <Route path="/meditate" element={<MeditatePage />} />
        <Route path="/gratitude" element={<GratitudePage />} />
        <Route path="/sanctuary" element={<SanctuaryPage />} />
        <Route path="/sessions" element={<HistoryPage />} />
        <Route path="/sessions/new" element={<LogSessionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

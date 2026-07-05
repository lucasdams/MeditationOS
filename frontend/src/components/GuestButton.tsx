import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

/** "Use without signing up" — creates an anonymous account and enters the app. */
export default function GuestButton({ onError }: { onError: (msg: string) => void }) {
  const { refresh } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  async function handleGuest() {
    onError('')
    setLoading(true)
    try {
      await authService.guest()
      await refresh()
      navigate('/')
    } catch {
      onError(t('auth.guest.error'))
      setLoading(false)
    }
  }

  return (
    <button type="button" className="btn btn--secondary guest-btn" onClick={handleGuest} disabled={loading}>
      {loading ? t('auth.guest.starting') : t('auth.guest.continue')}
    </button>
  )
}

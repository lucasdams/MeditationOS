import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

/** Shown to guest accounts: nudge them to claim the account before they lose it. */
export default function GuestBanner() {
  const { user } = useAuth()
  const { t } = useT()
  if (!user || !user.is_guest) return null

  return (
    <div className="guest-banner" role="status">
      <span>{t('auth.guestBanner.text.pre')}</span>
      <Link to="/settings">
        {t('auth.guestBanner.cta')}
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
      </Link>
    </div>
  )
}

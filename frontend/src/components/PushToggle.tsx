import { useEffect, useState } from 'react'
import { pushService, pushSupported } from '../services/push'
import { useT } from '../i18n'

// Push notification opt-in. Self-contained: it checks its own subscription state and
// surfaces a clear message if push isn't available (dev / no VAPID keys / permission
// denied). The service worker is production-only, so this is inert in dev by design.
export default function PushToggle() {
  const { t } = useT()
  const [supported] = useState(pushSupported)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (supported) pushService.isSubscribed().then(setOn).catch(() => {})
  }, [supported])

  if (!supported) return null

  async function toggle() {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      if (on) {
        await pushService.disable()
        setOn(false)
        setMsg(t('settings.push.off'))
      } else {
        await pushService.enable()
        setOn(true)
        setMsg(t('settings.push.on'))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('settings.push.err'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h2>{t('settings.push.heading')}</h2>
      <p className="muted">
        {t('settings.push.desc')}
      </p>
      <button type="button" onClick={toggle} disabled={busy}>
        {busy ? t('settings.push.busy') : on ? t('settings.push.disable') : t('settings.push.enable')}
      </button>
      {msg && <p role="status" className="success">{msg}</p>}
      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
    </section>
  )
}

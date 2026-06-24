import { useEffect, useState } from 'react'
import { pushService, pushSupported } from '../services/push'

// Push notification opt-in. Self-contained: it checks its own subscription state and
// surfaces a clear message if push isn't available (dev / no VAPID keys / permission
// denied). The service worker is production-only, so this is inert in dev by design.
export default function PushToggle() {
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
        setMsg('Push notifications turned off.')
      } else {
        await pushService.enable()
        setOn(true)
        setMsg('Push notifications are on for this device.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not change push notifications.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h2>Push notifications</h2>
      <p className="muted">
        Get practice nudges as push notifications on this device (alongside email).
        Available in the installed app.
      </p>
      <button type="button" onClick={toggle} disabled={busy}>
        {busy ? '…' : on ? 'Turn off push' : 'Enable push'}
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

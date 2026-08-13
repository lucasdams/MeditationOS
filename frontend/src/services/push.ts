import { api } from './api'

interface PushConfig {
  configured: boolean
  public_key: string
}

// Why enabling push failed — a CODE, not copy, so the UI (PushToggle) can render a
// localized message for it. Services stay copy-free; the catalog owns the wording.
export type PushErrorCode = 'noServiceWorker' | 'notConfigured' | 'permissionDenied'

export class PushError extends Error {
  readonly code: PushErrorCode
  constructor(code: PushErrorCode) {
    super(code)
    this.name = 'PushError'
    this.code = code
  }
}

// Push needs a service worker + the Push API. The SW is registered in production only,
// so this is inert in dev (no active registration) — by design.
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export const pushService = {
  getConfig: () => api.get<PushConfig>('/push/config'),

  // Whether this browser currently has an active push subscription.
  async isSubscribed(): Promise<boolean> {
    const reg = await registration()
    if (!reg) return false
    return (await reg.pushManager.getSubscription()) != null
  },

  // Request permission, subscribe, and register the endpoint with the backend.
  // Throws a coded PushError on failure; PushToggle maps the code to localized copy.
  async enable(): Promise<void> {
    const reg = await registration()
    if (!reg) throw new PushError('noServiceWorker')
    const config = await pushService.getConfig()
    if (!config.configured) throw new PushError('notConfigured')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new PushError('permissionDenied')
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.public_key) as BufferSource,
    })
    await api.post<void>('/push/subscribe', sub.toJSON())
  },

  async disable(): Promise<void> {
    const reg = await registration()
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await api.post<void>('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
    await sub.unsubscribe()
  },
}

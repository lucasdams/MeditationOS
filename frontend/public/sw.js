/* MeditationOS service worker — app-shell caching for offline + Web Push.
   Registered in production only (see main.tsx), so it never interferes with the Vite
   dev server / HMR.
   Cache versioning: bump CACHE_VERSION on every SW deploy so activate purges the old
   cache and returning users never get stranded on a stale index.html. */
const CACHE = 'medos-v2-20260616'
// Only precache truly static, rarely-changing assets.  index.html / '/' is intentionally
// excluded: navigations are handled network-first below so the browser always fetches a
// fresh shell on a deploy.  Caching '/' here would freeze the old HTML under a key that
// activate can never bust (because the name didn't change between deploys).
const STATIC_ASSETS = ['/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  // Delete every cache whose name is not the current CACHE version.  Because we bumped
  // the version string, this cleanly removes the old 'medos-v1' (or any prior) cache
  // that held the stale index.html.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // pass through cross-origin (API, fonts)

  if (req.mode === 'navigate') {
    // Network-first for navigations: always fetch a fresh index.html from the server so
    // a new deploy's HTML is picked up immediately.  On network failure (offline) fall
    // back to the last successfully-fetched shell that we stored in the cache.
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache the fresh shell so we have an up-to-date copy for offline fallback.
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(new Request('/'), clone))
          }
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Stale-while-revalidate for same-origin static GETs (hashed build assets).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})

self.addEventListener('push', (event) => {
  let data = { title: 'MeditationOS', body: 'Time for a few mindful minutes.' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* keep the default */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'medos-reminder',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})

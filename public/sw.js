const CACHE_NAME = 'skippy-v1'
const OFFLINE_URL = '/offline'

// Static assets to pre-cache for faster loads
const PRECACHE_URLS = [
  '/',
  '/login',
  '/manifest.json',
  '/img/skippyENHANCED3D-removebg.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Skip API calls — always go to network
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses for static assets
        if (response.ok && (url.pathname.startsWith('/img/') || url.pathname.startsWith('/_next/static/'))) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request).then(r => r || Response.error()))
  )
})

// ── Web Push: show OS notification even when app is closed ──────────────────
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { data = { title: 'Skippy', body: event.data?.text() || '' } }

  const title = data.title || 'Skippy'
  const options = {
    body: data.body || '',
    icon: '/img/skippyENHANCED3D-removebg.png',
    // badge: small monochrome icon shown in Android status bar
    badge: '/img/badge-96.png',
    data: { url: data.url || '/chat' },
    // Use a timestamp-based tag for nudges so they stack instead of replacing each other
    tag: data.tag || 'skippy-push',
    requireInteraction: false,  // false = Android dismisses after tap, no lingering
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Tap notification → open/focus the app ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/chat'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // If a Skippy window is already open, focus it and navigate
      const existing = list.find(c => c.url.includes(self.location.origin))
      if (existing && 'navigate' in existing) {
        existing.focus()
        return existing.navigate(targetUrl)
      }
      if (existing) {
        existing.focus()
        return
      }
      // Otherwise open a new window (primary path on Android)
      return clients.openWindow(targetUrl)
    })
  )
})

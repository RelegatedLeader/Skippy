const CACHE_NAME = 'skippy-v2'

// Only cache things we know exist — /offline doesn't exist so omit it
const PRECACHE_URLS = [
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
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
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
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Skippy'
  const body  = data.body  || ''

  // Keep options minimal — empty arrays / unsupported fields silently kill the
  // notification on Android Chrome / Brave. Only include proven-safe fields.
  const options = {
    body,
    icon:  '/img/skippyENHANCED3D-removebg.png',
    badge: '/img/badge-96.png',
    tag:   data.tag || 'skippy-' + Date.now(),
    data:  { url: data.url || '/chat' },
    renotify: !!data.tag,  // re-alert if same tag used intentionally
    requireInteraction: !!data.requireInteraction,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Tap notification → open / focus the app ─────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/chat'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      // Try to find an open window and navigate it
      for (var i = 0; i < list.length; i++) {
        var w = list[i]
        if (w.url && w.url.includes(self.location.origin)) {
          if ('navigate' in w) {
            w.focus()
            return w.navigate(targetUrl)
          }
          w.focus()
          return
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})

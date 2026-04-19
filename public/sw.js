/**
 * P3-1: Service Worker for PWA offline support
 * Strategy: Cache-First for static assets, Network-First for API calls
 */

const CACHE_NAME = 'restaurant-pos-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
]

// Install: cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    }).then(() => self.skipWaiting()),
  )
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
    }).then(() => self.clients.claim()),
  )
})

// Fetch: route-based strategy
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // API calls: Network-First with cache fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/collections/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET API responses
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached
            // Return offline JSON for API calls
            if (url.pathname.startsWith('/api/')) {
              return new Response(
                JSON.stringify({ error: 'offline', message: '当前处于离线状态，部分数据可能不是最新的' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } },
              )
            }
            throw new Error('Network error')
          })
        }),
    )
    return
  }

  // Static assets: Cache-First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Background revalidate
        fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response))
          }
        }).catch(() => {})
        return cached
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    }),
  )
})

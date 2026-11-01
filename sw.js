/* ============================================
   SMART MIRROR — Service Worker (Offline PWA)
   ============================================ */

const CACHE_NAME = 'smart-mirror-v27';

// Files to cache for offline use
const ASSETS_TO_CACHE = [
  './?v=27',
  './index.html?v=27',
  './style.css?v=27',
  './config.js?v=27',
  './app.js?v=27',
  './vendor/vosk-browser-0.0.8.js?v=27',
  './voice.js?v=27',
  './manifest.json?v=27',
];

// ── Install: cache all core assets ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Smart Mirror PWA...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for core assets, network-first for API calls ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.pathname.startsWith('/models/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // API calls (weather, news, spotify) → Network first, fallback to cache
  if (url.hostname !== self.location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if offline
          return caches.match(event.request);
        })
    );
    return;
  }

  // Core assets → Cache first, fallback to network
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
  );
});

// ── Background Sync: update data when back online ──
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

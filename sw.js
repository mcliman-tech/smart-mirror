/* ============================================
   SMART MIRROR — Service Worker (Offline PWA)

   Versione 2: strategia "network-first" per HTML e JS.

   Perché è cambiata: la versione precedente serviva prima la cache, quindi
   dopo un deploy l'iPad continuava a mostrare i file vecchi (e con il
   vecchio codice Vosk dava 404 sul modello). Ora:

   - HTML, JS, CSS, manifest → prima la rete (max 3 s), cache solo se offline.
     Così un deploy si vede al primo caricamento.
   - Immagini e font → cache-first (cambiano raramente).
   - Modello vocale e feed RSS → mai in cache qui.

   La versione in uso viene da version.js (unico punto di verità).
   ============================================ */

importScripts('./version.js');

const VERSION = self.SM_VERSION || 'dev';
const CACHE_NAME = `smart-mirror-${VERSION}`;
const NETWORK_TIMEOUT = 3000;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './version.js',
  './style.css',
  './config.js',
  './lights.js',
  './app.js',
  './vendor/vosk-browser-0.0.8.js',
  './voice.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const CACHEABLE_API_HOSTS = new Set([
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
]);

// ── Install ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .catch(err => console.warn('[SW] Precache incompleto:', err))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: via tutte le cache vecchie, subito ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Modello vocale (~48 MB): mai qui, la gestisce il browser.
  if (url.pathname.startsWith('/models/')) return;

  // Feed RSS di terze parti: rete pura.
  if (/rss|feed|\/sitemaps\//i.test(url.pathname)) return;

  // API di dati: network-first con fallback in cache.
  if (url.hostname !== self.location.hostname) {
    const hasSecretInUrl = /[?&](appid|api_?key|token|secret)=/i.test(url.search);
    if (!CACHEABLE_API_HOSTS.has(url.hostname) || hasSecretInUrl) return;

    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const isDocument = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');
  const isCode = /\.(?:js|css|json)$/i.test(url.pathname);
  const isVersionFile = url.pathname.endsWith('/version.js');

  // Codice e HTML: prima la rete, così un aggiornamento si vede subito.
  if (isDocument || isCode || isVersionFile) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Immagini, icone, font: cache-first.
  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await promiseWithTimeout(fetch(request), NETWORK_TIMEOUT);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
      return response;
    }
    throw new Error(`HTTP ${response && response.status}`);
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // Per le navigazioni offline, l'HTML in cache è meglio di un errore.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

function promiseWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ── Aggiornamento automatico ──
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', () => {
  const check = () => self.registration.update().catch(() => {});
  setInterval(check, 60 * 60 * 1000);
});

self.addEventListener('controllerchange', () => {
  if (self.__reloadedAfterUpdate) return;
  self.__reloadedAfterUpdate = true;
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => clients.forEach(client => client.navigate(client.url)))
    .catch(() => {});
});

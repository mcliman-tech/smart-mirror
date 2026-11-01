/* ============================================
   SMART MIRROR — Service Worker (Offline PWA)

   La versione arriva da version.js (unico punto di verità).
   Cambiando il numero lì, il browser considera il service worker
   nuovo, ricarica gli asset e cancella la cache vecchia.
   ============================================ */

importScripts('./version.js');

const VERSION = self.SM_VERSION || 'dev';
const CACHE_NAME = `smart-mirror-${VERSION}`;

// File da tenere in cache per l'uso offline.
// Nota: nessun parametro ?v= qui — la query è gestita dal browser,
// quello che conta è che questi file siano disponibili senza rete.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './version.js',
  './style.css',
  './config.js',
  './app.js',
  './vendor/vosk-browser-0.0.8.js',
  './voice.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Host di cui è ammesso mettere in cache le risposte (dati, non segreti).
const CACHEABLE_API_HOSTS = new Set([
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
]);

// ── Install: cache all core assets ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Smart Mirror', VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch(err => {
        // Un asset mancante non deve bloccare l'aggiornamento del resto.
        console.warn('[SW] Precache incompleto:', err);
        return self.skipWaiting();
      })
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Modello vocale (~48 MB): mai in cache del service worker, la gestisce
  // il browser con gli header di cache. Intercettarla qui la rallenterebbe.
  if (url.pathname.startsWith('/models/')) {
    return;
  }

  // Feed RSS non raggiungibili direttamente dal browser (niente CORS):
  // la rete li gestisce, nessuna cache di risposte di terze parti.
  if (/rss|feed|\/sitemaps\//i.test(url.pathname)) {
    return;
  }

  // API di dati: network-first, fallback alla copia in cache se offline.
  // Solo host in whitelist e solo se la URL non contiene segreti in chiaro.
  if (url.hostname !== self.location.hostname) {
    const hasSecretInUrl = /[?&](appid|api_?key|token|secret)=/i.test(url.search);
    const isCacheable = CACHEABLE_API_HOSTS.has(url.hostname) && !hasSecretInUrl;

    if (!isCacheable) return; // lascia fare al browser

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

  // Asset locali: cache-first, poi rete.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// ── Sorveglianza: lo specchio deve restare aperto per giorni ──
// Controlla periodicamente se c'è una versione nuova; se c'è, la installa
// e ricarica le schede aperte una sola volta, così l'iPad si aggiorna da solo
// senza che nessuno debba ricordarsi di ricaricare la pagina.
self.addEventListener('activate', () => {
  const check = () => self.registration.update().catch(() => {});
  setInterval(check, 60 * 60 * 1000); // ogni ora
});

self.addEventListener('controllerchange', () => {
  // Evita un loop di ricariche: una sola per attivazione.
  if (self.__reloadedAfterUpdate) return;
  self.__reloadedAfterUpdate = true;
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => clients.forEach(client => client.navigate(client.url)))
    .catch(() => {});
});

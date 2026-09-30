const CACHE_NAME = 'mt360-static-v2'; // bumping this deletes older caches on activate
const MAX_ENTRIES = 80;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only cache a genuine, non-redirected, non-HTML response. Otherwise an expired session
// (asset request -> redirect -> login page) would be stored under the JS file's URL.
const cacheable = (res, allowHtml) =>
  res.ok && !res.redirected && (allowHtml || !(res.headers.get('content-type') || '').includes('text/html'));

async function put(key, res) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(key, res);
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) await cache.delete(keys[0]); // prune old deploys' assets
}

self.addEventListener('fetch', (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/login' || url.pathname === '/logout') return;

  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (cacheable(res, false)) event.waitUntil(put(req, res.clone()));
      return res;
    })));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      if (cacheable(res, true)) event.waitUntil(put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
  }
});

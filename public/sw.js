// GoChords service worker.
// Goal: make the app installable as a PWA and keep it loading fast on repeat
// visits. We deliberately keep the strategy simple — no precaching of hashed
// assets (their filenames change every build), no offline fallback page, no
// background sync. Network-first for navigations means a fresh deploy is
// visible on the next reload; stale-while-revalidate for everything else
// keeps repeat loads snappy.

// Bump on releases that change index.html (route bridge, meta-tag injection)
// so returning users drop their stale runtime cache on activate.
const VERSION = 'v3';
const RUNTIME_CACHE = `gochords-runtime-${VERSION}`;

self.addEventListener('install', (event) => {
  // Activate immediately on first install so users don't need a second reload.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('gochords-') && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests. Supabase / Google Fonts go straight to network.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first so deploys take effect on next reload;
  // fall back to cached index.html if the user is offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match('/');
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })(),
  );
});

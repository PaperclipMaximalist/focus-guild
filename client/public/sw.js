/**
 * Focus Guild service worker.
 *
 * Deliberately hand-written and small: no build plugin, no precache manifest
 * to keep in sync with Vite's hashed filenames.
 *
 * Strategy:
 *   - navigations: network first, falling back to the cached shell, so a dead
 *     connection opens the app instead of the browser's error page
 *   - hashed build assets: cache first (the hash changes when they do)
 *   - everything else, including every API call: straight to the network,
 *     because stale quests and schedules would be worse than none
 */

const VERSION = 'fg-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/icon-192.png']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API and fonts: untouched

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(async () => (await caches.match('/')) ?? Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(ASSETS).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});

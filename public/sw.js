/* Torque House service worker: cache-first for GLBs / thumbs / basis transcoder.
 * GLB URLs carry ?v=<hash> from manifest.json, so a rebuilt asset gets a new cache key automatically. */
const CACHE = 'torque-house-assets-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('torque-house-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const cacheable = /\/assets\/(glb|thumbs)\//.test(url.pathname) || /\/basis\//.test(url.pathname);
  if (!cacheable) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) {
        // Drop stale versions of the same file (different ?v=hash).
        const keys = await cache.keys();
        await Promise.all(keys.filter((k) => new URL(k.url).pathname === url.pathname && k.url !== e.request.url).map((k) => cache.delete(k)));
        cache.put(e.request, res.clone());
      }
      return res;
    }),
  );
});

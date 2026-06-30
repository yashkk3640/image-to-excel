// Hand-written service worker — no build step, no framework. Read top-to-bottom.
//
// Goal: the app works offline after the first visit. Three strategies:
//   1. App navigations  -> network-first, fall back to the cached shell.
//   2. Same-origin files -> stale-while-revalidate (instant load, refresh in bg).
//   3. OCR engine (CDN)  -> cache-first (large, immutable wasm + language data).
//
// Privacy note: this only ever caches the app's own code and the Tesseract
// engine. User images are never fetched over the network, so they are never
// cached or sent anywhere.

const CACHE = 'image-to-excel-v1';

// Hosts that serve the Tesseract.js worker, core wasm, and language packs.
const OCR_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'tessdata.projectnaptha.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(self.registration.scope, { cache: 'reload' }))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fetching;
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    return res;
  } catch {
    return (await cache.match(self.registration.scope)) || (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (OCR_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

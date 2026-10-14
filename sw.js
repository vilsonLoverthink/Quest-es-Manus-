const CACHE_PREFIX = 'questoes-manus-cfs31-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const BASE_URL = new URL('.', self.registration.scope);
const REQUIRED_ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'answer-key-client.js',
  'question-collaboration.js',
  'manifest.webmanifest',
  'assets/cfs31-icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/brazil-flag.jpg',
  'data/questions.json',
].map(path => new URL(path, BASE_URL).href);
const OPTIONAL_ASSETS = [
  'data/questions_cfs30.json',
  'data/questions_cfs30_pending.json',
].map(path => new URL(path, BASE_URL).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(REQUIRED_ASSETS);
    await Promise.all(OPTIONAL_ASSETS.map(async url => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) await cache.put(url, response);
      } catch { /* Suplementos opcionais não impedem a instalação offline. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(new URL('index.html', BASE_URL).href, response.clone());
        return response;
      } catch {
        return (await cache.match(new URL('index.html', BASE_URL).href)) || Response.error();
      }
    })());
    return;
  }

  if (/\.json(?:$|\?)/i.test(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request).then(response => {
        if (response.ok) void cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      return cached || await network || Response.error();
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch { return Response.error(); }
  })());
});

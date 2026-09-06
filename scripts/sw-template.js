const PREFIX = 'svwb:' + self.registration.scope + ':';
const CACHE = PREFIX + '__VERSION__';
const FILES = __FILES__;
const url = (path) => new URL(path, self.registration.scope).href;
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          FILES.map((path) => new Request(url(path), { cache: 'reload' })),
        ),
      ),
  );
});
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Keep older assets for already-running pages until their reload completes.
      // Only remove caches for this app, never another GitHub Pages project.
      const keys = await caches.keys();
      const old = keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE);
      for (const key of old.slice(0, -1)) await caches.delete(key);
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.registration.scope)
  )
    return;
  const path = new URL(request.url).pathname;
  const home = new URL(self.registration.scope).pathname;
  if (
    request.mode === 'navigate' &&
    (path === home || path === home + 'index.html')
  ) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(url('index.html'))) || fetch(request),
        ),
    );
  } else if (FILES.some((f) => url(f) === request.url)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(async (cache) => (await cache.match(request)) || fetch(request)),
    );
  }
});

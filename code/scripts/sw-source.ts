// The text of sw.js. It lives here so tests can run it. Called by the service worker plugin in vite.config.ts.
export const swSource = (version: string, files: string[]): string => `const CACHE = 'dnd-sheet-${version}';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pages: network first so updates land on the next launch, cache when offline.
  // no-cache revalidates with the server, so a launch right after a deploy doesn't get the HTTP-cached page.
  if (req.mode === 'navigate') {
    const network = fetch(req, { cache: 'no-cache' }).then((res) =>
      res.ok && !res.redirected ? res : caches.match('./index.html').then((hit) => hit || res));
    // On a slow connection, show the cached page after 3 s instead of waiting for the network.
    // Without a cached copy (first launch) keep waiting.
    const slow = new Promise((resolve) => setTimeout(resolve, 3000))
      .then(() => caches.match('./index.html'))
      .then((hit) => hit || network);
    e.respondWith(
      Promise.race([network, slow]).catch(() => caches.match('./index.html').then((hit) => hit || network))
    );
    return;
  }
  // Hashed assets never change: cache first.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;

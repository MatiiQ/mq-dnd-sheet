/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Files in public/ that the app needs offline.
const PUBLIC_FILES = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

// Emits sw.js with the list of built files, so the whole app is cached on first launch.
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    // After Vite's HTML plugin, so index.html is in the bundle and its contents count toward the version.
    enforce: 'post',
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff') && f !== 'index.html');
      const files = ['./index.html', ...PUBLIC_FILES.map((f) => './' + f), ...built.map((f) => './' + f)];
      // The version hashes file contents, not just names, so a change to index.html or a public/ file
      // (which keep their names) still gives a new sw.js and installed apps update.
      const hash = createHash('sha256').update(files.join('\n'));
      for (const out of Object.values(bundle)) hash.update(out.type === 'chunk' ? out.code : out.source);
      for (const f of PUBLIC_FILES) hash.update(readFileSync(join(publicDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const source = `const CACHE = 'dnd-sheet-${version}';
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
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
      // Only a real page replaces the offline copy, not an error or a Wi-Fi login page.
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
      }
      return res;
    });
    // On a slow connection, show the cached page after 3 s instead of waiting for the network.
    // Without a cached copy (first launch) keep waiting. The fetch carries on, so the copy still updates.
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
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: { environment: 'node' }
});

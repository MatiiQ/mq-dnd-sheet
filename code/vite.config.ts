/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { swSource } from './scripts/sw-source.ts';

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
      const source = swSource(version, files);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: { environment: 'node' }
});

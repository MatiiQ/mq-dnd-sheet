import { describe, expect, it, vi } from 'vitest';
import { swSource } from './sw-source.ts';

type Req = string | { url: string };
const keyOf = (r: Req) => (typeof r === 'string' ? r : r.url);

// Runs the worker with fakes. `seed` is the cache: key → body text, and a new Response on each match.
function worker(seed: Record<string, string>, fetchStub: () => Promise<Response>) {
  const store = new Map(Object.entries(seed));
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; }, skipWaiting: () => {}, clients: { claim: () => {} } };
  const caches = {
    open: async () => ({
      put: async (r: Req, res: Response) => { store.set(keyOf(r), await res.text()); },
      addAll: async () => {}
    }),
    match: async (r: Req) => { const b = store.get(keyOf(r)); return b === undefined ? undefined : new Response(b); },
    keys: async () => [],
    delete: async () => true
  };
  const fetch = vi.fn(fetchStub);
  new Function('self', 'caches', 'fetch', 'location', swSource('test', []))(self, caches, fetch, { origin: 'https://x' });
  const fire = (request: { method: string; url: string; mode: string }) => {
    let responded: Promise<Response> | undefined;
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p; } });
    return responded!;
  };
  const navigate = () => fire({ method: 'GET', url: 'https://x/', mode: 'navigate' });
  // Writes to the cache run after the response arrives, so wait before reading it.
  const cached = async (k: string) => { await new Promise((r) => setTimeout(r, 5)); return store.get(k); };
  return { fire, navigate, cached, fetch };
}

describe('service worker', () => {
  it('serves the cached page when the network answers 503', async () => {
    const w = worker({ './index.html': 'cached' }, async () => new Response('down', { status: 503 }));
    expect(await (await w.navigate()).text()).toBe('cached');
  });

  it('serves the cached page when the network fails', async () => {
    const w = worker({ './index.html': 'cached' }, () => Promise.reject(new TypeError('offline')));
    expect(await (await w.navigate()).text()).toBe('cached');
  });

  it('shows a new page but keeps the offline copy', async () => {
    const w = worker({ './index.html': 'cached' }, async () => new Response('new'));
    expect(await (await w.navigate()).text()).toBe('new');
    expect(await w.cached('./index.html')).toBe('cached');
  });

  it('returns the error on a first launch with nothing cached', async () => {
    const w = worker({}, async () => new Response('down', { status: 503 }));
    expect((await w.navigate()).status).toBe(503);
  });

  it('serves a precached asset without the network', async () => {
    const url = 'https://x/assets/a.js';
    const w = worker({ [url]: 'asset' }, async () => new Response('net'));
    expect(await (await w.fire({ method: 'GET', url, mode: 'cors' })).text()).toBe('asset');
    expect(w.fetch).not.toHaveBeenCalled();
  });
});

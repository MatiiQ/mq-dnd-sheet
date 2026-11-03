import { describe, expect, it, vi } from 'vitest';
import { swSource } from './sw-source.ts';

type Req = string | { url: string };
const keyOf = (r: Req) => (typeof r === 'string' ? r : r.url);

const OWN = 'dnd-sheet-test';
// Runs the worker with fakes. `seed`: cache name → key → body text, oldest cache first; a new Response on each match.
function worker(seed: Record<string, Record<string, string>>, fetchStub: () => Promise<Response>, registration: { installing?: unknown } = {}) {
  const stores = new Map(Object.entries(seed).map(([name, c]) => [name, new Map(Object.entries(c))]));
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; }, skipWaiting: () => {}, clients: { claim: () => {} }, registration };
  const caches = {
    open: async () => ({ addAll: async () => {} }),
    match: async (r: Req, opts?: { cacheName?: string }) => {
      const walk = opts?.cacheName ? [stores.get(opts.cacheName)] : [...stores.values()];
      for (const store of walk) {
        const b = store?.get(keyOf(r));
        if (b !== undefined) return new Response(b);
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name)
  };
  const fetch = vi.fn(fetchStub);
  new Function('self', 'caches', 'fetch', 'location', swSource('test', []))(self, caches, fetch, { origin: 'https://x' });
  const waiting: Promise<unknown>[] = [];
  const fire = (request: { method: string; url: string; mode: string }) => {
    let responded: Promise<Response> | undefined;
    listeners.fetch({ request, waitUntil: (p: Promise<unknown>) => { waiting.push(p); }, respondWith: (p: Promise<Response>) => { responded = p; } });
    return responded!;
  };
  const navigate = () => fire({ method: 'GET', url: 'https://x/', mode: 'navigate' });
  const settled = () => Promise.all(waiting);
  return { fire, navigate, settled, fetch, cacheNames: () => [...stores.keys()], cached: (k: string) => stores.get(OWN)?.get(k) };
}
const page = (body: string) => ({ './index.html': body });

describe('service worker', () => {
  it('serves the cached page when the network answers 503', async () => {
    const w = worker({ [OWN]: page('cached') }, async () => new Response('down', { status: 503 }));
    expect(await (await w.navigate()).text()).toBe('cached');
  });

  it('serves the cached page when the network fails', async () => {
    const w = worker({ [OWN]: page('cached') }, () => Promise.reject(new TypeError('offline')));
    expect(await (await w.navigate()).text()).toBe('cached');
  });

  it('shows a new page but keeps the offline copy', async () => {
    const w = worker({ [OWN]: page('cached') }, async () => new Response('new'));
    expect(await (await w.navigate()).text()).toBe('new');
    await w.settled();
    expect(w.cached('./index.html')).toBe('cached');
  });

  it('returns the error on a first launch with nothing cached', async () => {
    const w = worker({}, async () => new Response('down', { status: 503 }));
    expect((await w.navigate()).status).toBe(503);
  });

  it('serves a precached asset without the network', async () => {
    const url = 'https://x/assets/a.js';
    const w = worker({ [OWN]: { [url]: 'asset' } }, async () => new Response('net'));
    expect(await (await w.fire({ method: 'GET', url, mode: 'cors' })).text()).toBe('asset');
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('serves its own page offline, not an older cache', async () => {
    const w = worker({ 'dnd-sheet-old': page('old'), [OWN]: page('own') }, () => Promise.reject(new TypeError('offline')), { installing: {} }); // installing: the old cache stays
    expect(await (await w.navigate()).text()).toBe('own');
  });

  it('uses its own page on a 503 too', async () => {
    const w = worker({ 'dnd-sheet-old': page('old'), [OWN]: page('own') }, async () => new Response('down', { status: 503 }), { installing: {} });
    expect(await (await w.navigate()).text()).toBe('own');
  });

  it('keeps a cache while another worker fills it', async () => {
    const w = worker({ 'dnd-sheet-old': page('old'), [OWN]: page('own'), 'dnd-sheet-next': {} }, async () => new Response('new'), { installing: {} });
    await w.navigate();
    await w.settled();
    expect(w.cacheNames()).toEqual(['dnd-sheet-old', OWN, 'dnd-sheet-next']);
  });

  it('drops old caches once no worker is installing', async () => {
    const w = worker({ 'dnd-sheet-old': page('old'), [OWN]: page('own') }, async () => new Response('new'));
    await w.navigate();
    await w.settled();
    expect(w.cacheNames()).toEqual([OWN]);
  });

  it('still finds an old page’s chunk in the old cache', async () => {
    const url = 'https://x/assets/old.js';
    const w = worker({ 'dnd-sheet-old': { [url]: 'chunk' }, [OWN]: {} }, async () => new Response('net'));
    expect(await (await w.fire({ method: 'GET', url, mode: 'cors' })).text()).toBe('chunk');
    expect(w.fetch).not.toHaveBeenCalled();
  });
});

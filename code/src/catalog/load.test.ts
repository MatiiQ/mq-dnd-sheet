import { beforeEach, expect, it, vi } from 'vitest';
import srdEntries from '../data/srd/index';
import type { Entry } from './schema';

const chunk = vi.hoisted(() => ({ importSrd: vi.fn<() => Promise<Entry[]>>() }));
vi.mock('./srd-chunk', async (orig) => {
  const real = await orig<typeof import('./srd-chunk')>();
  chunk.importSrd.mockImplementation(real.importSrd);
  return chunk;
});
const { catalogVersion, loadCatalog, onCatalogReset, resetCatalog } = await import('./load');

beforeEach(() => {
  resetCatalog();
  chunk.importSrd.mockClear();
});

it('loads the SRD catalog once, merged with no pack', async () => {
  const a = loadCatalog();
  expect(loadCatalog()).toBe(a);
  const cat = await a;
  expect(cat.list).toHaveLength(srdEntries.length);
  expect(cat.byId.get('spell/fireball')!.name).toBe('Fireball');
});

it('loads again after the pack changed', async () => {
  const a = loadCatalog();
  resetCatalog();
  expect(loadCatalog()).not.toBe(a);
  await a;
});

it('bumps the version and tells the listeners on a reset', () => {
  const v = catalogVersion();
  const fn = vi.fn();
  const off = onCatalogReset(fn);
  resetCatalog();
  expect(catalogVersion()).toBe(v + 1);
  expect(fn).toHaveBeenCalledTimes(1);
  off();
  resetCatalog();
  expect(fn).toHaveBeenCalledTimes(1);
});

it('a failure of a load from before a reset keeps the newer cached load', async () => {
  let fail!: (e: unknown) => void;
  chunk.importSrd.mockImplementationOnce(() => new Promise<Entry[]>((_, reject) => { fail = reject; }));
  const a = loadCatalog();
  resetCatalog();
  const b = loadCatalog();
  fail(new Error('offline'));
  await expect(a).rejects.toThrow('offline');
  expect(loadCatalog()).toBe(b);
  expect(chunk.importSrd).toHaveBeenCalledTimes(2);
  await b;
});

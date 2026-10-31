import { expect, it, vi } from 'vitest';
import srdEntries from '../data/srd/index';
import { mergeCatalog, type Catalog } from './merge';
import { entriesOf, startLoad, type CatalogState } from './useCatalog';

const catA = mergeCatalog(srdEntries, null);
const catB = mergeCatalog(srdEntries.slice(0, 10), null);
const flush = () => new Promise((r) => setTimeout(r, 0));

it('sets loading, then ready with the catalog', async () => {
  const set = vi.fn<(s: CatalogState) => void>();
  startLoad(() => Promise.resolve(catA), set, () => false);
  expect(set).toHaveBeenLastCalledWith({ status: 'loading' });
  await flush();
  expect(set).toHaveBeenLastCalledWith({ status: 'ready', cat: catA });
  expect(set).toHaveBeenCalledTimes(2);
});

it('keeps the ready state while a reload runs', async () => {
  const set = vi.fn<(s: CatalogState) => void>();
  startLoad(() => Promise.resolve(catA), set, () => false, true);
  expect(set).not.toHaveBeenCalled();
  await flush();
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenLastCalledWith({ status: 'ready', cat: catA });
});

it('sets error on a failed load, and retry loads again', async () => {
  const states: CatalogState[] = [];
  let n = 0;
  const load = () => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(catA));
  startLoad(load, (s) => states.push(s), () => false);
  await flush();
  const last = states.at(-1)!;
  expect(last.status).toBe('error');
  if (last.status !== 'error') return;
  last.retry();
  await flush();
  expect(n).toBe(2);
  expect(states.at(-1)).toEqual({ status: 'ready', cat: catA });
});

it('drops the result of a stale load', async () => {
  let stale = false;
  let done!: (c: Catalog) => void;
  const set = vi.fn<(s: CatalogState) => void>();
  startLoad(() => new Promise<Catalog>((r) => { done = r; }), set, () => stale);
  stale = true;
  done(catA);
  await flush();
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenLastCalledWith({ status: 'loading' });

  const set2 = vi.fn<(s: CatalogState) => void>();
  startLoad(() => Promise.reject(new Error('x')), set2, () => true);
  await flush();
  expect(set2).toHaveBeenCalledTimes(1);
});

it('a load after a reset gets the new catalog (reopen case)', async () => {
  let cur = catA;
  const states: CatalogState[] = [];
  startLoad(() => Promise.resolve(cur), (s) => states.push(s), () => false);
  await flush();
  cur = catB;
  startLoad(() => Promise.resolve(cur), (s) => states.push(s), () => false);
  await flush();
  expect(states.at(-1)).toEqual({ status: 'ready', cat: catB });
});

it('entriesOf lists the entries of one kind', () => {
  const spells = entriesOf(catA, 'spell');
  expect(spells.length).toBeGreaterThan(100);
  expect(spells.every((e) => e.kind === 'spell')).toBe(true);
  expect(spells.some((e) => e.id === 'spell/fireball')).toBe(true);
});

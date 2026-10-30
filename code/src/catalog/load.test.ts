import { expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { loadCatalog } from './load';

it('loads the SRD catalog once, merged with no pack', async () => {
  const a = loadCatalog();
  expect(loadCatalog()).toBe(a);
  const cat = await a;
  expect(cat.list).toHaveLength(srdEntries.length);
  expect(cat.byId.get('spell/fireball')!.name).toBe('Fireball');
});

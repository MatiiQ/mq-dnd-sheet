// Reads the local PHB pack (reference/build/phb-pack.json, gitignored), so it runs only where the pack was built.
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import srdEntries from '../../src/data/srd/index.ts';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import { PHB_TO_SRD, type Entry } from '../../src/catalog/schema.ts';

const PACK = new URL('../../../reference/build/phb-pack.json', import.meta.url);
const readPack = (p: URL): Entry[] => JSON.parse(readFileSync(p, 'utf8')).entries;

it.skipIf(!existsSync(PACK))('merged with the pack, no entry is listed under its PHB alias', () => {
  const names = new Set(mergeCatalog(srdEntries, readPack(PACK)).list.map((e) => e.name));
  for (const phb of Object.keys(PHB_TO_SRD)) expect(names.has(phb)).toBe(false);
});

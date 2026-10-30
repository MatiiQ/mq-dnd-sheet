// The PHB-only entries of the vertical slice exist in the merged catalog and validate. Names only: their grants are
// checked in code/scripts/local/ (gitignored), because those numbers are PHB-only data. Runs where the pack is built.
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import srdEntries from '../../src/data/srd/index.ts';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import { validateEntry, type Entry } from '../../src/catalog/schema.ts';

const PACK = new URL('../../../reference/build/phb-pack.json', import.meta.url);
const SLICE = [
  'subclass/druid/circle-of-the-stars', 'feature/druid/circle-of-the-stars/star-map', 'feature/druid/circle-of-the-stars/starry-form',
  'feature/druid/circle-of-the-stars/cosmic-omen', 'feature/druid/circle-of-the-stars/twinkling-constellations',
  'species/aasimar', 'trait/aasimar/celestial-resistance', 'trait/aasimar/darkvision', 'trait/aasimar/healing-hands', 'trait/aasimar/light-bearer',
  'trait/aasimar/celestial-revelation', 'background/guide', 'feat/war-caster', 'spell/hail-of-thorns', 'spell/thorn-whip'
];

it.skipIf(!existsSync(PACK))('has every PHB-only slice entry in the merged catalog, valid', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  for (const id of SLICE) expect([id, cat.byId.get(id)?.src, cat.byId.has(id) && validateEntry(cat.byId.get(id))]).toEqual([id, 'phb', []]);
});

// The PHB-only entries of the vertical slice exist in the merged catalog and validate. Names only: their grants are
// checked in code/scripts/local/ (gitignored), because those numbers are PHB-only data. Checks below compare an entry's
// grants with its own pack fields, so they hold no PHB data. Runs where the pack is built.
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import srdEntries from '../../src/data/srd/index.ts';
import { mergeCatalog } from '../../src/catalog/merge.ts';
import { validateEntry, type Entry } from '../../src/catalog/schema.ts';
import { addFromCatalog, missingPicks } from '../../src/catalog/copy';
import { blankCharacter } from '../../src/defaults';
import { effScore, skillLevel } from '../../src/logic';

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

// Every background grants what its fields name: the three abilities as one +2/+1-or-+1/+1/+1 choice, its two skills,
// and its tool (a fixed proficiency, or a choice from the tool's group). Reads the pack's own fields, no PHB data here.
it.skipIf(!existsSync(PACK))('gives every PHB background its ability, skill and tool grants', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const bgs = cat.list.filter((e) => e.kind === 'background' && e.src === 'phb') as (Entry & { abils: string; skills: string; tool: string; grants: Record<string, unknown>[] })[];
  expect(bgs.length).toBe(12);
  for (const b of bgs) {
    const abil = b.grants.find((g) => g.kind === 'choice' && g.id === 'abil') as { pick: number; repeat: boolean; options: { kind: string; ab: string; val: string; cap: number }[] } | undefined;
    expect([b.id, abil?.pick, abil?.repeat, abil?.options.map((o) => `${o.kind}:${o.ab}:${o.val}:${o.cap}`)])
      .toEqual([b.id, 3, true, b.abils.split(',').map((a) => `abil:${a}:1:20`)]);
    const skills = b.grants.filter((g) => g.kind === 'prof' && g.cat === 'skill').map((g) => g.target);
    expect([b.id, skills]).toEqual([b.id, b.skills.split(',')]);
    const group = ({ 'one-kind-of-artisans-tools': 'artisan', 'one-kind-of-gaming-set': 'gaming-set', 'one-kind-of-musical-instrument': 'musical-instrument' } as Record<string, string>)[b.tool];
    const tool = b.grants.find((g) => (g.kind === 'prof' && g.cat === 'tool') || (g.kind === 'choice' && String(g.pool ?? '').startsWith('tool:')));
    if (group) expect([b.id, tool?.pool]).toEqual([b.id, `tool:${group}`]);
    else expect([b.id, tool && cat.byId.get(`prof/${b.tool}`)?.name]).toEqual([b.id, tool?.target]);
  }
});

// The add flow of a PHB background: its ability and tool choices are asked, and the answers land on the sheet.
it.skipIf(!existsSync(PACK))('adds a PHB background with its ability picks, skills and chosen tool', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const guard = cat.byId.get('background/guard')!, blank = blankCharacter();
  expect(missingPicks(cat, blank, guard, {})).toEqual(['abil', 'tool']);
  const c = addFromCatalog(blank, cat, guard, { picks: { abil: ['o1', 'o1', 'o3'], tool: ['Dice'] }, counted: {}, links: {}, nested: { 'feat/alert': { picks: {}, counted: {}, links: {} } } });
  expect(effScore(c, 'str') - effScore(blank, 'str')).toBe(2);
  expect(effScore(c, 'wis') - effScore(blank, 'wis')).toBe(1);
  expect([skillLevel(c, 'athletics').level, skillLevel(c, 'perception').level]).toEqual([1, 1]);
  expect(c.feats.map((f) => f.name)).toEqual(expect.arrayContaining(['Guard', 'Alert']));
  expect(JSON.stringify(c)).toContain('Dice');
});

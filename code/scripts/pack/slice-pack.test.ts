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

// A feat's Ability Score Increase, read from its own "ASI:" line: the abilities it names ("any one ability" = all six) and
// its maximum ("(max N)", else 20, the reference's convention). The grants offer exactly those abilities with that cap,
// as fixed `abil` grants, a choice of `abil` options, or an `abil` grant over an `ability:` pool choice.
const ABIL_WORD: Record<string, string> = { Str: 'str', Dex: 'dex', Con: 'con', Int: 'int', Wis: 'wis', Cha: 'cha' };
type G = Record<string, unknown> & { kind: string; options?: G[] };
function offeredAbils(grants: G[]): { abs: string[]; caps: number[] } {
  const abs: string[] = [], caps: number[] = [];
  const pools = new Map(grants.filter((g) => g.kind === 'choice' && String(g.pool ?? '').startsWith('ability:')).map((g) => [g.id, String(g.pool).slice(8).split('|')]));
  for (const g of grants.flatMap((x) => (x.kind === 'choice' ? x.options ?? [] : [x]))) {
    if (g.kind !== 'abil') continue;
    const ab = String(g.ab);
    abs.push(...(ab.startsWith('$') ? pools.get(ab.slice(1)) ?? [] : [ab]));
    caps.push(g.cap as number);
  }
  return { abs: [...new Set(abs)].sort(), caps: [...new Set(caps)] };
}
it.skipIf(!existsSync(PACK))('gives every PHB feat with an ASI line the abilities and maximum that line names', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const feats = cat.list.filter((e) => e.kind === 'feat' && e.src === 'phb') as (Entry & { grants: G[] })[];
  let n = 0;
  for (const f of feats) {
    const line = /^ASI: (.+)$/m.exec(f.desc)?.[1];
    if (!line || f.id === 'feat/resilient') continue;
    n++;
    const abs = /any one ability/.test(line) ? Object.values(ABIL_WORD) : [...line.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\b/g)].map((m) => ABIL_WORD[m[1]]);
    const cap = Number(/\(max (\d+)\)/.exec(line)?.[1] ?? 20);
    expect([f.id, offeredAbils(f.grants)]).toEqual([f.id, { abs: [...abs].sort(), caps: [cap] }]);
  }
  expect(n).toBeGreaterThan(40);
});

// Resilient: one pick, each option pairs the ability's +1 with its saving throw proficiency under one `opt`.
it.skipIf(!existsSync(PACK))('pairs Resilient’s ability increase with the same saving throw', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const r = cat.byId.get('feat/resilient') as Entry & { grants: G[] };
  const ch = r.grants.find((g) => g.kind === 'choice')!;
  expect(ch.pick).toBe(1);
  const byOpt = new Map<string, string[]>();
  for (const o of ch.options!) byOpt.set(String(o.opt), [...(byOpt.get(String(o.opt)) ?? []), o.kind === 'abil' ? `abil:${o.ab}:${o.cap}` : `${o.kind}:${o.cat}:${o.target}`]);
  expect(byOpt.size).toBe(6);
  for (const ab of Object.values(ABIL_WORD)) expect([...byOpt.values()]).toContainEqual([`abil:${ab}:20`, `prof:save:${ab}`]);
});

// The add flow of Resilient and of a spell feat: the answers land as one ability with its save, and as spells cast with
// the increased ability, each with its free cast.
it.skipIf(!existsSync(PACK))('adds Resilient and Fey-Touched with their picks', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const blank = { ...blankCharacter(), level: 4 }, none = { counted: {}, links: {} };
  const res = cat.byId.get('feat/resilient')!;
  expect(missingPicks(cat, blank, res, {})).toEqual(['c1']);
  const c = addFromCatalog(blank, cat, res, { picks: { c1: ['o9'] }, ...none });
  expect(effScore(c, 'wis') - effScore(blank, 'wis')).toBe(1);
  expect(c.grants.filter((g) => g.kind === 'prof').map((g) => [g.cat, g.target])).toEqual([['save', 'wis']]);
  const fey = cat.byId.get('feat/fey-touched')!;
  expect(missingPicks(cat, blank, fey, {})).toEqual(['asi', 'sp']);
  const f = addFromCatalog(blank, cat, fey, { picks: { asi: ['cha'], sp: ['spell/bless'] }, ...none });
  expect(f.spells.map((s) => [s.name, s.castAb])).toEqual(expect.arrayContaining([['Misty Step', 'cha'], ['Bless', 'cha']]));
  expect(f.res.map((r) => r.name)).toEqual(expect.arrayContaining(['Misty Step (free cast)', 'Bless (free cast)']));
});

// Speeds a feature gives only while its effect is on (an On/Off switch on the feature).
it.skipIf(!existsSync(PACK))('gives Twinkling Constellations and Revelation in Flesh their Fly Speeds while active', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  for (const [id, val] of [['feature/druid/circle-of-the-stars/twinkling-constellations', '20'], ['feature/sorcerer/aberrant-sorcery/revelation-in-flesh', 'walk']]) {
    const fly = (cat.byId.get(id) as Entry & { grants: G[] }).grants.find((g) => g.kind === 'speed');
    expect([id, fly?.mode, fly?.val, fly?.hover, fly?.when]).toEqual([id, 'fly', val, true, 'active']);
  }
});

// Elemental Weapon's extra damage and attack bonus are grants while it is on (lowest slot; weapon and type at the table).
it.skipIf(!existsSync(PACK))('gives Elemental Weapon an extra 1d4 and +1 to attack while it is on', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const e = cat.byId.get('spell/elemental-weapon') as Entry & { fx: string; grants?: G[] };
  expect(e.fx).toBe('other');
  expect(e.grants).toEqual([
    expect.objectContaining({ kind: 'xdmg', dice: '1d4', dtype: 'Acid/Cold/Fire/Lightning/Thunder', when: 'active' }),
    expect.objectContaining({ kind: 'atkBonus', val: '1', when: 'active' })]);
  expect(e.grants!.some((g) => g.weapon || g.wrange || g.prop)).toBe(false);
});

// PHB spells with more than one damage effect: one row per part. Lightning Arrow's hit rides on the weapon attack
// (no save on its main row, so it groups as damage); Hunger of Hadar's start-of-turn Cold has no save.
it.skipIf(!existsSync(PACK))('gives the PHB multi-damage spells their parts', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  const row = (e: Record<string, unknown>) => [e.dice, e.dtype ?? e.dtypes, e.save ?? e.atk ?? '-', e.scale ?? '-'].join(' ');
  const want: Record<string, string[]> = {
    'spell/toll-the-dead': ['1d8 Necrotic wis cantrip', 'Missing HP: 1d12 Necrotic wis cantrip'],
    'spell/destructive-wave': ['5d6 Thunder con -', 'Radiant or Necrotic: 5d6 Radiant,Necrotic con -'],
    'spell/lightning-arrow': ['4d8 Lightning - 1d8/slot', 'Burst: 2d8 Lightning dex 1d8/slot'],
    'spell/hunger-of-hadar': ['2d6 Cold - 1d6/slot', 'Acid: 2d6 Acid dex 1d6/slot'],
    'spell/jallarzis-storm-of-radiance': ['2d10 Radiant con 1d10/slot', 'Thunder: 2d10 Thunder con 1d10/slot'],
    'spell/witch-bolt': ['2d12 Lightning ranged 1d12/slot', 'Later: 1d12 Lightning - -']
  };
  for (const [id, rows] of Object.entries(want)) {
    const e = cat.byId.get(id) as unknown as Record<string, unknown> & { parts?: Record<string, unknown>[] };
    expect([id, [row(e), ...(e.parts ?? []).map((p) => `${p.label}: ${row(p)}`)]]).toEqual([id, rows]);
  }
});

// "Cantrip Upgrade: None" gives no scale.
it.skipIf(!existsSync(PACK))('gives Blade Ward and Friends no cantrip scaling', () => {
  const cat = mergeCatalog(srdEntries, (JSON.parse(readFileSync(PACK, 'utf8')) as { entries: Entry[] }).entries);
  for (const id of ['spell/blade-ward', 'spell/friends']) expect([id, (cat.byId.get(id) as { scale?: string }).scale]).toEqual([id, undefined]);
});

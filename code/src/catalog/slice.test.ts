// The vertical slice: every SRD entry the two sample characters use. PHB-only entries of the slice are checked by
// name in scripts/pack/slice-pack.test.ts, their grants only locally.
import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { druidSample, sampleCharacter } from '../defaults';
import { catalogId, validateEntry, type ChoiceSpec, type Spec } from './schema';

const byId = new Map(srdEntries.map((e) => [e.id, e]));
const get = (id: string) => { const e = byId.get(id); if (!e) throw new Error(`${id} missing`); return e; };
const specs = (id: string): Spec[] => { const e = get(id); return 'grants' in e && e.grants ? e.grants : []; };
const choices = (id: string): ChoiceSpec[] => specs(id).filter((s): s is ChoiceSpec => s.kind === 'choice');

// PHB-only in SRD 5.2.1 (scripts/srd/names-diff.ts): Circle of the Stars, Aasimar, Guide, War Caster, Hail of Thorns, Thorn Whip.
const PHB_ONLY_SPELLS = ['Hail of Thorns', 'Thorn Whip'];
const RANGER = ['spellcasting', 'favored-enemy', 'weapon-mastery', 'deft-explorer', 'fighting-style', 'ranger-subclass', 'ability-score-improvement', 'extra-attack'];
const DRUID = ['spellcasting', 'druidic', 'primal-order', 'wild-shape', 'wild-companion', 'druid-subclass', 'ability-score-improvement', 'wild-resurgence', 'elemental-fury'];
const SLICE = [
  'class/ranger', ...RANGER.map((f) => `feature/ranger/${f}`), 'subclass/ranger/hunter', 'feature/ranger/hunter/hunters-lore', 'feature/ranger/hunter/hunters-prey',
  'class/druid', ...DRUID.map((f) => `feature/druid/${f}`),
  'species/elf', ...['darkvision', 'elven-lineage', 'wood-elf', 'fey-ancestry', 'keen-senses', 'trance'].map((t) => `trait/elf/${t}`),
  'background/sage', 'feat/magic-initiate', 'feat/ability-score-improvement', 'feat/archery',
  ...[...sampleCharacter().spells, ...druidSample().spells].map((s) => s.name).filter((n) => !PHB_ONLY_SPELLS.includes(n)).map((n) => catalogId('spell', n)),
  ...['Studded Leather Armor', 'Longbow', 'Shortsword', 'Cartographer’s Tools', 'Explorer’s Pack', 'Traveler’s Clothes', 'Arrows', 'Potion of Healing',
    'Cloak of Elvenkind', 'Leather Armor', 'Shield', 'Quarterstaff', 'Sickle', 'Herbalism Kit', 'Calligrapher’s Supplies', 'Book', 'Parchment', 'Robe'].map((n) => catalogId('item', n))
];

describe('vertical slice (SRD)', () => {
  it('has every SRD entry the samples use, valid', () => {
    for (const id of new Set(SLICE)) expect([id, byId.has(id) && validateEntry(byId.get(id))]).toEqual([id, []]);
  });
  it('Ability Score Improvement: one feature per class, again at later levels, any feat', () => {
    const asi = srdEntries.filter((e) => e.kind === 'feature' && e.name === 'Ability Score Improvement');
    expect(asi).toHaveLength(12);
    expect(get('feature/ranger/ability-score-improvement')).toMatchObject({ lvl: 4, again: '8,12,16' });
    for (const e of asi) expect([e.id, choices(e.id)[0]?.pool]).toEqual([e.id, 'feat:any']);
  });
});

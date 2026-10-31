// The vertical slice: every SRD entry the two sample characters use, with the grants plan 3 builds on. PHB-only
// entries of the slice are checked by name in scripts/pack/slice-pack.test.ts, their grants only locally.
import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { druidSample, sampleCharacter } from '../defaults';
import { catalogId, validateEntry, type ChoiceSpec, type GrantSpec, type Spec } from './schema';

const byId = new Map(srdEntries.map((e) => [e.id, e]));
const get = (id: string) => { const e = byId.get(id); if (!e) throw new Error(`${id} missing`); return e; };
const specs = (id: string): Spec[] => { const e = get(id); return 'grants' in e && e.grants ? e.grants : []; };
const grants = (id: string): GrantSpec[] => specs(id).filter((s): s is GrantSpec => s.kind !== 'choice');
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
  it('Ranger: Extra Attack, Favored Enemy, Weapon Mastery and Deft Explorer (PHB p.119–120)', () => {
    expect(grants('feature/ranger/extra-attack')).toMatchObject([{ kind: 'attacks', val: '2' }]);
    expect(grants('feature/ranger/favored-enemy')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'spell', spell: 'spell/hunters-mark', always: true }),
      expect.objectContaining({ kind: 'resource', max: '1:2,5:3,9:4,13:5,17:6', recharge: 'long', casts: 'spell/hunters-mark' })]));
    expect(grants('feature/ranger/weapon-mastery')).toMatchObject([{ kind: 'prof', cat: 'mastery', val: '2' }]);
    const [exp, lang] = choices('feature/ranger/deft-explorer');
    expect([exp.pick, lang.pick]).toEqual([1, 2]);
    expect(grants('feature/ranger/deft-explorer')).toMatchObject([{ kind: 'prof', cat: 'expertise', target: `$${exp.id}` }, { kind: 'prof', cat: 'language', target: `$${lang.id}` }]);
  });
  it('Hunter’s Prey offers Colossus Slayer as extra damage once per turn (PHB p.127)', () => {
    expect(choices('feature/ranger/hunter/hunters-prey')[0].options).toContainEqual(expect.objectContaining({ kind: 'xdmg', dice: '1d8', perTurn: true }));
  });
  it('Archery: +2 to attack rolls with Ranged weapons, any attack mode (PHB p.209)', () => {
    const [g] = grants('feat/archery');
    expect(g).toMatchObject({ kind: 'atkBonus', val: '2', wrange: 'ranged' });
    expect(g.amode).toBeUndefined();
  });
  it('Druid: Wild Shape uses, partial regain and its Bonus Action (PHB p.80)', () => {
    const [res, act] = grants('feature/druid/wild-shape');
    expect(res).toMatchObject({ kind: 'resource', max: '2:2,6:3,17:4', recharge: 'long', regain: '1', regainOn: 'short' });
    expect(act).toMatchObject({ kind: 'action', econ: 'bonus', res: res.id });
  });
  it('Druid: Primal Order’s Warden is one pick of two grants (PHB p.80)', () => {
    const warden = choices('feature/druid/primal-order')[0].options!.filter((o) => o.opt === 'Warden');
    expect(warden).toMatchObject([{ kind: 'prof', target: 'Martial weapons' }, { kind: 'prof', target: 'Medium armor' }]);
  });
  it('Elf and Wood Elf (SRD 5.2.1 p.84–85)', () => {
    expect(grants('trait/elf/darkvision')).toMatchObject([{ kind: 'sense', range: '60' }]);
    expect(grants('trait/elf/fey-ancestry')).toMatchObject([{ kind: 'defense', def: 'adv', target: 'vs Charmed' }]);
    expect(choices('trait/elf/keen-senses')[0].options!.map((o) => o.target)).toEqual(['insight', 'perception', 'survival']);
    const wood = grants('trait/elf/wood-elf');
    expect(wood).toContainEqual(expect.objectContaining({ kind: 'speed', mode: 'walk', val: '5' }));
    expect(wood.filter((g) => g.kind === 'spell').map((g) => [g.spell, g.lvl])).toEqual([['spell/druidcraft', undefined], ['spell/longstrider', 3], ['spell/pass-without-trace', 5]]);
  });
  it('Magic Initiate: list, cantrips and a level 1 spell from it, ability, one free cast (PHB p.201)', () => {
    const [list, cantrips, spell1, ab] = choices('feat/magic-initiate');
    expect([list.pool, cantrips.pick, cantrips.pool, spell1.pool, ab.pool]).toEqual(['list:cleric|druid|wizard', 2, 'spell:list=$list;lvl=0', 'spell:list=$list;lvl=1', 'ability:int|wis|cha']);
    expect(grants('feat/magic-initiate')).toContainEqual(expect.objectContaining({ kind: 'resource', max: '1', recharge: 'long', casts: '$spell1' }));
  });
  it('Ability Score Improvement: one feature per class, again at later levels, a General feat', () => {
    const asi = srdEntries.filter((e) => e.kind === 'feature' && e.name === 'Ability Score Improvement');
    expect(asi).toHaveLength(12);
    expect(get('feature/ranger/ability-score-improvement')).toMatchObject({ lvl: 4, again: '8,12,16' });
    for (const e of asi) expect([e.id, choices(e.id)[0]?.pool]).toEqual([e.id, 'feat:cat=general']);
  });
});

describe('spell grants in the slice', () => {
  it('Shillelagh overrides the attack ability of a club or quarterstaff while on (PHB p.316)', () => {
    expect(grants('spell/shillelagh')).toEqual([{ id: 'g1', kind: 'atkAbil', name: 'Shillelagh', ab: 'cast', weapons: 'club,quarterstaff', amode: 'melee', die: '1:1d8,5:1d10,11:1d12,17:2d6', when: 'active' }]);
  });
});

describe('Resourceful', () => {
  it('gives Heroic Inspiration on each Long Rest (PHB p.194)', () => {
    expect(grants('trait/human/resourceful')).toEqual([{ id: 'g1', kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }]);
  });
});

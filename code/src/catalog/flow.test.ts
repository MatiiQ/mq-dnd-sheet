import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { blankCharacter } from '../defaults';
import type { Character } from '../types';
import { addChoicePicks, addFromCatalog, blocksPick, needed, resolveChoices } from './copy';
import { withClass } from '../test-fixtures';
import { buildChoices, choiceKey, choiceStepReady, choiceSteps, flowNodes, flowReview, togglePick, type ChoiceOpts, type FlowAnswers } from './flow';
import type { BackgroundEntry, ChoiceSpec, Entry, FeatEntry, GrantSpec } from './schema';
import { mergeCatalog } from './merge';

const cat = mergeCatalog(srdEntries, null);
const E = (id: string) => cat.byId.get(id)!;

describe('buildChoices', () => {
  it('gives the answers ChoiceFlow hands on (ChoiceFlow.test.tsx pins the same literals)', () => {
    expect(buildChoices(cat, blankCharacter(), E('feat/skilled'), { '': { picks: { c1: ['athletics', 'stealth', 'perception'] }, counted: {}, links: {} } }))
      .toEqual({ picks: { c1: ['athletics', 'stealth', 'perception'] }, counted: {}, links: {} });
    const acolyte = {
      '': { picks: { abil: ['o2', 'o2', 'o3'] }, counted: {}, links: {}, equip: 'A' as const },
      '>feat/magic-initiate': { picks: { cantrips: ['spell/guidance', 'spell/light'], spell1: ['spell/bless'], ab: ['wis'] }, counted: {}, links: {} }
    };
    expect(buildChoices(cat, blankCharacter(), E('background/acolyte'), acolyte)).toEqual({
      picks: { abil: ['o2', 'o2', 'o3'] }, counted: {}, links: {}, equip: 'A',
      nested: { 'feat/magic-initiate': { picks: { list: ['cleric'], cantrips: ['spell/guidance', 'spell/light'], spell1: ['spell/bless'], ab: ['wis'] }, counted: {}, links: {} } }
    });
  });
  it('resolves a link answer against the sheet it is given', () => {
    // The free cast's resource as resolveChoices names it once the spell is picked.
    const RES = resolveChoices(cat, E('feat/magic-initiate'), { list: ['wizard'], spell1: ['spell/magic-missile'] }).specs.find((g) => g.id === 'g3')!.name;
    const ans = { '': { picks: { list: ['wizard'], cantrips: ['spell/light', 'spell/mage-hand'], spell1: ['spell/magic-missile'], ab: ['int'] }, counted: {}, links: {} } };
    const sheet = (id: string): Character => ({ ...blankCharacter(), res: [{ id, name: RES, count: 1, max: 1, recharge: 'long' }] });
    expect(buildChoices(cat, sheet('r1'), E('feat/magic-initiate'), ans).links).toEqual({ g3: 'r1' });
    expect(buildChoices(cat, sheet('r9'), E('feat/magic-initiate'), ans).links).toEqual({ g3: 'r9' });
  });
});

describe('addChoicePicks', () => {
  it('adds the picks of one choice under the feature already on the sheet', () => {
    const c: Character = { ...withClass(blankCharacter(), { clsId: 'class/sorcerer', lvl: 3 }), feats: [{ id: 'm', g: 'class', name: 'Metamagic', desc: '', cid: 'feature/sorcerer/metamagic' }] };
    const out = addChoicePicks(c, cat, 'm', E('feature/sorcerer/metamagic'), 'meta',
      { picks: { meta: ['feature/sorcerer/careful-spell', 'feature/sorcerer/distant-spell'] }, counted: {}, links: {} });
    expect(out.feats.filter((f) => f.from === 'feature:m').map((f) => f.cid)).toEqual(['feature/sorcerer/careful-spell', 'feature/sorcerer/distant-spell']);
    expect(out.feats.filter((f) => f.cid === 'feature/sorcerer/metamagic')).toHaveLength(1);
  });
});

// ---- Choice steps (creator fixes, Task 8): a synthetic catalog ----
const opt = (id: string): GrantSpec => ({ id, kind: 'prof', name: id.toUpperCase(), cat: 'language', target: id.toUpperCase() });
const sf = (id: string, p: Partial<FeatEntry> = {}): FeatEntry => ({ id: 'feat/' + id, kind: 'feat', name: id[0].toUpperCase() + id.slice(1), src: 'srd', desc: '', cat: 'general', grants: [], ...p });
const choice2: ChoiceSpec = { kind: 'choice', id: 'x', name: 'X', pick: 2, options: [opt('a'), opt('b'), opt('c')] };
const twoPick = sf('two-pick', { grants: [choice2] });
const alert = sf('alert', { cat: 'origin' });
const pickOrigin = sf('pick-origin', { grants: [{ kind: 'choice', id: 'feat', name: 'Origin feat', pick: 1, pool: 'feat:cat=origin' }] });
const keen = sf('keen', { grants: [{ kind: 'choice', id: 'c2', name: 'Skill', pick: 1, pool: 'skill:arcana|history', orExpert: true }] });
const boons = ['a', 'b', 'c'].map((x) => sf(x, { cat: 'boon' }));
const pick2Choice: ChoiceSpec = { kind: 'choice', id: 'f', name: 'Feats', pick: 2, pool: 'feat:cat=boon' };
const pick2Entry = sf('pick-two', { grants: [pick2Choice] });
const rep = sf('rep', { grants: [{ kind: 'choice', id: 'r', name: 'R', pick: 3, repeat: true, pool: 'feat:cat=boon' }] });
const nested = sf('nested', { grants: [{ kind: 'choice', id: 'abil', name: 'Nested abil', pick: 1, options: [opt('n1'), opt('n2')] }] });
const acFeat = sf('ac-feat', { grants: [{ id: 'g1', kind: 'ac', name: 'AC +1', acMode: 'bonus', val: '1' }] });
const lightFeat = sf('light-feat', { grants: [{ id: 'g1', kind: 'spell', name: 'Light', spell: 'Light' }] });
const bg = (id: string, p: Partial<BackgroundEntry>): BackgroundEntry => ({ id: 'background/' + id, kind: 'background', name: id, src: 'srd', desc: '', feat: 'feat/none', equip: '', grants: [], ...p });
const bgWithNestedAbil = bg('nest', { feat: 'feat/nested', grants: [{ kind: 'choice', id: 'abil', name: 'Abil', pick: 1, options: [opt('o1'), opt('o2')] }] });
const soldier = bg('soldier', { equipA: 'Rope', gpA: 10, gpB: 50 });
const bgWithEquipAndCountableFeat = bg('armored', { feat: 'feat/ac-feat', equipA: 'Rope', gpB: 50 });
const syn = mergeCatalog([twoPick, alert, pickOrigin, keen, ...boons, pick2Entry, rep, nested, acFeat, lightFeat, bgWithNestedAbil, soldier, bgWithEquipAndCountableFeat], null);
const flow = (picks: Record<string, string[]>, key = ''): FlowAnswers => ({ [key]: { picks, counted: {}, links: {} } });
const featRow = (cid: string, name: string) => ({ id: 'id-' + cid, g: 'feat', name, desc: '', cid }) as Character['feats'][number];
const c = blankCharacter();
const cWithFeat: Character = { ...c, feats: [featRow('feat/alert', 'Alert')] };
const cTwoTaken: Character = { ...c, feats: [featRow('feat/a', 'A'), featRow('feat/b', 'B')] };
const cArcana: Character = { ...c, skillProf: { ...c.skillProf, arcana: 1 } };
const cWithAcMods: Character = { ...c, acMods: [{ id: 'm1', name: 'Old ring', val: 1 }] as Character['acMods'] };
const first = (cc: Character, e: Entry, a: FlowAnswers = {}, o?: ChoiceOpts) => choiceSteps(syn, cc, e, a, o)[0];

describe('choiceSteps', () => {
  it("skipChoices skips the entry's own abil, not a nested entry's abil", () => {
    const ids = choiceSteps(syn, c, bgWithNestedAbil, {}, { skipChoices: ['abil'] }).map(choiceKey);
    expect(ids).not.toContain('_/abil');
    expect(ids).toContain('>feat/nested/abil');
    expect(choiceSteps(syn, c, bgWithNestedAbil, {}).map(choiceKey)).toContain('_/abil');
  });
  it('lists a review step exactly when ChoiceFlow shows one', () => {
    expect(choiceSteps(syn, c, acFeat, {}).at(-1)).toMatchObject({ kind: 'review' });
    expect(choiceSteps(syn, c, acFeat, {}, { noCounts: true, noLinks: true }).some((s) => s.kind === 'review')).toBe(false);
  });
  it('noEquip drops the background package step', () => {
    expect(choiceSteps(syn, c, soldier, {}).map(choiceKey)).toEqual(['equip']);
    expect(choiceSteps(syn, c, soldier, {}, { noEquip: true })).toEqual([]);
  });
  it("keeps today's order: choices, review, then the package", () => {
    const kinds = choiceSteps(syn, cWithAcMods, bgWithEquipAndCountableFeat, {}).map((s) => s.kind);
    expect(kinds.slice(-2)).toEqual(['review', 'equip']);
  });
});

describe('choiceStepReady', () => {
  it('missing names what is left, none when ready', () => {
    const s = first(c, twoPick);
    expect(choiceStepReady(syn, c, s, {})).toEqual({ ready: false, missing: 'Choose 2' });
    expect(choiceStepReady(syn, c, s, flow({ x: ['a'] })).missing).toBe('Choose 1 more');
    expect(choiceStepReady(syn, c, s, flow({ x: ['a', 'b'] }))).toEqual({ ready: true });
  });
  it('a stored pick that is held or taken is not ready, with its name', () => {
    expect(choiceStepReady(syn, cWithFeat, first(cWithFeat, pickOrigin), flow({ feat: ['feat/alert'] })).missing).toBe('Already on your sheet: Alert');
    expect(choiceStepReady(syn, c, first(c, twoPick), flow({ x: ['a', 'b'] }), { held: ['a'] }).ready).toBe(false);
  });
  it('Keen Mind-like choice (skill pool, orExpert): a proficient skill can be picked and the step is ready', () => {
    expect(choiceStepReady(syn, cArcana, first(cArcana, keen), flow({ c2: ['arcana'] }))).toEqual({ ready: true });
  });
  it('a blocked option never makes a step unfinishable, and the add accepts what the step accepts', () => {
    expect(choiceStepReady(syn, cTwoTaken, first(cTwoTaken, pick2Entry), flow({ f: ['feat/c'] }))).toEqual({ ready: true });
    expect(needed(syn, cTwoTaken, pick2Choice, { f: ['feat/c'] }, [pick2Entry])).toBe(1);
    expect(() => addFromCatalog(cTwoTaken, syn, pick2Entry, buildChoices(syn, cTwoTaken, pick2Entry, flow({ f: ['feat/c'] })))).not.toThrow();
  });
  it('choiceNeed counts a stored valid pick once (union, not a sum)', () => {
    expect(choiceStepReady(syn, c, first(c, twoPick), flow({ x: ['a'] })).missing).toBe('Choose 1 more');
  });
  it('held caps choiceNeed only: held a and b on a 3-option pick-2 choice with pick override 2 needs 1', () => {
    expect(choiceStepReady(syn, c, first(c, twoPick), flow({ x: ['c'] }), { held: ['a', 'b'], pick: { x: 2 } })).toEqual({ ready: true });
    expect(needed(syn, c, choice2, { x: ['c'] }, [twoPick])).toBe(2);
  });
  it('a repeat choice with one pickable option needs what that option can fill (twice with repeat)', () => {
    const s = first(cTwoTaken, rep);
    expect(choiceStepReady(syn, cTwoTaken, s, flow({ r: ['feat/c'] })).missing).toBe('Choose 1 more');
    expect(choiceStepReady(syn, cTwoTaken, s, flow({ r: ['feat/c', 'feat/c'] }))).toEqual({ ready: true });
  });
  it('equip and review steps', () => {
    const eq = first(c, soldier);
    expect(choiceStepReady(syn, c, eq, {})).toEqual({ ready: false, missing: 'Choose a starting equipment option' });
    expect(choiceStepReady(syn, c, eq, { '': { picks: {}, counted: {}, links: {}, equip: 'B' } })).toEqual({ ready: true });
    const withLight: Character = { ...c, spells: [{ id: 's1', name: 'Light', lvl: 0 } as Character['spells'][number]] };
    const rv = choiceSteps(syn, withLight, lightFeat, {}).at(-1)!;
    expect(choiceStepReady(syn, withLight, rv, {})).toEqual({ ready: false, missing: 'Answer the question about Light' });
    expect(choiceStepReady(syn, withLight, rv, { '': { picks: {}, counted: {}, links: { g1: 'new' } } })).toEqual({ ready: true });
  });
});

describe('togglePick and blocksPick', () => {
  it('togglePick: a blocked value comes out but never goes in', () => {
    expect(togglePick(choice2, ['a'], 'a', { blocked: true })).toEqual([]);
    expect(togglePick(choice2, [], 'a', { blocked: true })).toBeNull();
    expect(togglePick(choice2, ['a'], 'b', { blocked: false })).toEqual(['a', 'b']);
  });
  it('blocksPick: a taken feat blocks, a taken skill does not, a held value always does', () => {
    expect(blocksPick('feat/alert', { option: { value: 'feat/alert', label: 'Alert', entry: alert, taken: true } })).toBe(true);
    expect(blocksPick('arcana', { option: { value: 'arcana', label: 'Arcana', taken: true } })).toBe(false);
    expect(blocksPick('arcana', { held: ['arcana'] })).toBe(true);
  });
});

describe('noCounts and noLinks', () => {
  it('noCounts: no counts at all, so nothing is counted', () => {
    const nodes = flowNodes(syn, cWithAcMods, acFeat, {});
    expect(flowReview(syn, cWithAcMods, nodes, {}).counts).toHaveLength(1);
    expect(flowReview(syn, cWithAcMods, nodes, {}, { noCounts: true }).counts).toEqual([]);
    expect(buildChoices(syn, cWithAcMods, acFeat, {}).counted).toEqual({ g1: true });
    expect(buildChoices(syn, cWithAcMods, acFeat, {}, {}, { noCounts: true }).counted).toEqual({});
  });
  it('noLinks links what it finds and asks nothing', () => {
    const withLight: Character = { ...c, spells: [{ id: 's1', name: 'Light', lvl: 0 } as Character['spells'][number]] };
    expect(buildChoices(syn, withLight, lightFeat, {}, {}, { noLinks: true }).links).toEqual({ g1: 's1' });
    expect(choiceSteps(syn, withLight, lightFeat, {}, { noLinks: true, noCounts: true }).some((s) => s.kind === 'review')).toBe(false);
    expect(choiceSteps(syn, withLight, lightFeat, {}).some((s) => s.kind === 'review')).toBe(true);
  });
});

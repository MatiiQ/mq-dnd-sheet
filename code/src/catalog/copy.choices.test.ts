import { describe, expect, it } from 'vitest';
import { withClass } from '../test-fixtures';
import srdEntries from '../data/srd/index';
import { blankCharacter, sampleCharacter } from '../defaults';
import { skillLevel } from '../logic';
import type { Character, ClassRow } from '../types';
import { entriesOf, mergeCatalog } from './merge';
import type { Entry, FeatureEntry, SpellEntry } from './schema';
import { featBenefits, firstSentence, atLevel, choiceActive, featureName, addFromCatalog, featureCandidates, countedDefault, choicesOf, classIdOf, matchId, subclassIdOf, type AddChoices, freeText, missingPicks, needed, optionGroups, poolOptions, prereqMet, resolveChoices, validPicks } from './copy';

const cat = mergeCatalog(srdEntries, null);
// ---- Task 3: choices and prerequisites ----
const choice = (e: Entry, id: string) => choicesOf(e).find((x) => x.id === id)!;
const withSkills = (keys: string[], over: Partial<Character> = {}): Character => ({ ...blankCharacter(), skillProf: Object.fromEntries(keys.map((k) => [k, 1])), ...over });
const A = (picks: Record<string, string[]> = {}, nested?: Record<string, AddChoices>, more: Partial<AddChoices> = {}): AddChoices =>
  ({ picks, counted: {}, links: {}, ...(nested ? { nested } : {}), ...more });
const E = (id: string) => cat.byId.get(id)!;

describe('poolOptions', () => {
  const blank = blankCharacter();
  it('offers the cantrips of the list picked first (Magic Initiate)', () => {
    const opts = poolOptions(cat, blank, 'spell:list=$list;lvl=0', { list: ['druid'] });
    expect(opts.length).toBeGreaterThan(3);
    for (const o of opts) expect(o.entry).toMatchObject({ kind: 'spell', lvl: 0, classes: expect.stringContaining('druid') });
    expect(opts.map((o) => o.value)).toContain('spell/guidance');
    expect(poolOptions(cat, blank, 'spell:list=$list;lvl=0', {})).toEqual([]);
  });
  it('filters by school, case-insensitively, and by a level range', () => {
    const opts = poolOptions(cat, blank, 'spell:list=wizard;school=evocation;lvl<=2', {});
    expect(opts.length).toBeGreaterThan(3);
    for (const o of opts) expect(o.entry).toMatchObject({ school: 'Evocation', lvl: expect.any(Number), classes: expect.stringContaining('wizard') });
    expect(opts.every((o) => (o.entry as SpellEntry).lvl <= 2)).toBe(true);
    expect(opts.some((o) => (o.entry as SpellEntry).lvl === 0)).toBe(true);
  });
  it('gives nothing for a pool it can’t parse', () => {
    expect(poolOptions(cat, blank, 'spell:lvl~3', {})).toEqual([]);
    expect(poolOptions(cat, blank, 'spell:list=nope;lvl=1', {})).toEqual([]);
  });
  it('lists the lineage options of a trait', () => {
    const opts = poolOptions(cat, blank, 'trait:of=trait/elf/elven-lineage', {});
    expect(opts.map((o) => o.value)).toContain('trait/elf/wood-elf');
    expect(opts.every((o) => (o.entry as { of?: string }).of === 'trait/elf/elven-lineage')).toBe(true);
  });
  it('filters a spell pool by the Ritual tag', () => {
    const rituals = poolOptions(cat, blank, 'spell:lvl=1;ritual=true', {});
    expect(rituals.map((o) => o.value)).toContain('spell/detect-magic');
    expect(rituals.map((o) => o.value)).not.toContain('spell/magic-missile');
    expect(rituals.every((o) => (o.entry as { ritual?: boolean }).ritual === true)).toBe(true);
  });
  it('lists the tools of a group, never the generic ones', () => {
    expect(poolOptions(cat, blank, 'tool:gaming-set', {}).map((o) => o.value).sort()).toEqual(['Dice', 'Dragonchess', 'Playing Cards', 'Three-Dragon Ante']);
    // The 17 Artisan's Tools (PHB p.220-221).
    const artisan = poolOptions(cat, blank, 'tool:artisan', {}).map((o) => o.value);
    expect(artisan).toHaveLength(17);
    expect(artisan).toContain('Smith’s Tools');
    expect(artisan).not.toContain('Thieves’ Tools');
    expect(poolOptions(cat, blank, 'tool:unknown-group', {})).toEqual([]);
    for (const pool of ['tool:any', 'prof:skill|tool']) {
      const vals = poolOptions(cat, blank, pool, {}).map((o) => o.value);
      expect(vals).not.toContain('Gaming Set');
      expect(vals).not.toContain('Musical Instrument');
      expect(vals).toContain('Lute');
    }
    expect(poolOptions(cat, blank, 'prof:skill|tool', {}).map((o) => o.value)).toContain('stealth');
  });
  it('offers proficient skills without Expertise for expertise picks', () => {
    const c = withSkills(['stealth', 'survival'], { grants: [{ id: 'x', kind: 'prof', name: 'Survival expertise', cat: 'expertise', target: 'survival', from: 'feature:f1' }],
      feats: [{ id: 'f1', g: 'class', name: 'X', desc: '' }] });
    expect(poolOptions(cat, c, 'skill:proficient', {}).map((o) => o.value)).toEqual(['stealth']);
  });
  it('marks feats whose prerequisites aren’t met', () => {
    const c = withClass({ ...blankCharacter(), abil: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }, { lvl: 5 });
    const opts = poolOptions(cat, c, 'feat:cat=general', {});
    expect(opts.find((o) => o.value === 'feat/grappler')!.unmet).toEqual(['Strength or Dexterity 13 or higher']);
    expect(opts.find((o) => o.value === 'feat/ability-score-improvement')!.unmet).toBeUndefined();
  });
  it('counts the entries being added for a feature prerequisite (Fighting Style)', () => {
    const blankR = blankCharacter();
    expect(poolOptions(cat, blankR, 'feat:cat=style', {}).find((o) => o.value === 'feat/archery')!.unmet).toEqual(['Fighting Style feature']);
    const style = cat.byId.get('feature/ranger/fighting-style')!;
    expect(poolOptions(cat, blankR, 'feat:cat=style', {}, [style]).find((o) => o.value === 'feat/archery')!.unmet).toBeUndefined();
  });
});

describe('freeText and needed', () => {
  const blank = blankCharacter();
  it('needed() with a taken entry option: min(pick, pickable ∪ stored)', () => {
    const n = entriesOf(cat, 'feat').filter((e) => e.cat === 'origin').length;
    const ch = { kind: 'choice' as const, id: 'f', name: 'Feats', pick: n, pool: 'feat:cat=origin' };
    const withAlert: Character = { ...blank, feats: [{ id: 'x', g: 'feat', name: 'Alert', desc: '', cid: 'feat/alert' }] };
    expect(needed(cat, blank, ch, {})).toBe(n);
    expect(needed(cat, withAlert, ch, {})).toBe(n - 1);
    expect(needed(cat, withAlert, ch, { f: ['feat/alert'] })).toBe(n);
  });
  it('needed() for skills marked taken still counts them', () => {
    const ch = { kind: 'choice' as const, id: 'c2', name: 'Skill', pick: 2, pool: 'skill:arcana|history', orExpert: true };
    expect(needed(cat, withSkills(['arcana', 'history']), ch, {})).toBe(2);
  });
  it('is free text for unknown kinds and for name pools with no options', () => {
    expect(freeText(cat, blank, 'spell:lvl~3', {})).toBe(true);
    expect(freeText(cat, blank, 'spell:list=nope;lvl=1', {})).toBe(true);
    expect(freeText(cat, blank, 'spell:list=wizard;lvl=1', {})).toBe(false);
    expect(freeText(cat, blank, 'metamagic:any', {})).toBe(true);
    expect(freeText(cat, blank, 'skill:proficient', {})).toBe(false);
    expect(freeText(cat, blank, 'tool:unknown-group', {})).toBe(true);
  });
  it('needs no more picks than the pool offers (Ranger Expertise)', () => {
    const exp = cat.byId.get('feature/ranger/expertise')!;
    const ch = choice(exp, 'exp');
    expect(needed(cat, withSkills(['stealth']), ch, {})).toBe(1);
    expect(missingPicks(cat, withSkills(['stealth']), exp, { exp: ['stealth'] })).toEqual([]);
    expect(needed(cat, sampleCharacter(), ch, {})).toBe(2);
    expect(needed(cat, blankCharacter(), ch, {})).toBe(0);
    expect(missingPicks(cat, blankCharacter(), exp, {})).toEqual([]);
    expect(resolveChoices(cat, exp, {}).specs).toEqual([]);
  });
});

describe('validPicks', () => {
  it('allows an option twice only with repeat', () => {
    const acolyte = cat.byId.get('background/acolyte')!;
    expect(validPicks(choice(acolyte, 'abil'), ['o2', 'o2', 'o2'])).toEqual(['o2', 'o2']);
    const grappler = cat.byId.get('feat/grappler')!;
    expect(validPicks(choice(grappler, 'c1'), ['o1', 'o1'])).toEqual(['o1']);
  });
});

describe('resolveChoices', () => {
  const mi = cat.byId.get('feat/magic-initiate')!;
  it('lists the missing choices', () => {
    expect(missingPicks(cat, blankCharacter(), mi, { list: ['druid'], cantrips: ['spell/guidance'] })).toEqual(['cantrips', 'spell1', 'ab']);
    expect(missingPicks(cat, blankCharacter(), mi, { list: ['druid'], cantrips: ['spell/guidance', 'spell/produce-flame'], spell1: ['spell/goodberry'], ab: ['wis'] })).toEqual([]);
  });
  it('gives a background’s ability picks, skill and tool grants, with ids per pick', () => {
    const acolyte = cat.byId.get('background/acolyte')!;
    const r = resolveChoices(cat, acolyte, { abil: ['o2', 'o2', 'o3'] });
    expect(r.specs.filter((s) => s.kind === 'abil').map((s) => [s.id, s.ab])).toEqual([['o2-0', 'wis'], ['o2-1', 'wis'], ['o3', 'cha']]);
    expect(r.specs.filter((s) => s.kind === 'prof').map((s) => s.target)).toEqual(['insight', 'religion', 'Calligrapher’s Supplies']);
    const thrice = resolveChoices(cat, acolyte, { abil: ['o2', 'o2', 'o2'] });
    expect(thrice.specs.filter((s) => s.kind === 'abil')).toHaveLength(2);
    expect(missingPicks(cat, blankCharacter(), acolyte, { abil: ['o2', 'o2', 'o2'] })).toEqual(['abil']);
  });
  it('copies a resource per pick, each casting its own spell (Signature Spells)', () => {
    const sig = cat.byId.get('feature/wizard/signature-spells')!;
    const r = resolveChoices(cat, sig, { sig: ['spell/fireball', 'spell/counterspell'] });
    expect(r.specs.map((s) => s.id)).toEqual(['g1-0', 'g1-1', 'g2-0', 'g2-1']);
    expect(r.specs.filter((s) => s.kind === 'resource').map((s) => [s.max, s.casts])).toEqual([['1', 'g1-0'], ['1', 'g1-1']]);
  });
  it('applies every grant of an opt group picked by its first option (Primal Order)', () => {
    const po = cat.byId.get('feature/druid/primal-order')!;
    expect(optionGroups(choice(po, 'order'))).toEqual([{ value: 'o1', label: 'Magician', ids: ['o1', 'o2'] }, { value: 'o3', label: 'Warden', ids: ['o3', 'o4'] }]);
    const ks = cat.byId.get('trait/elf/keen-senses')!;
    expect(optionGroups(choice(ks, 'c1')).map((g) => g.label)).toEqual(['Insight proficiency', 'Perception proficiency', 'Survival proficiency']);
    const r = resolveChoices(cat, po, { order: ['o3'] });
    expect(r.specs.map((s) => s.id)).toEqual(['o3', 'o4']);
    expect(r.specs.every((s) => !('opt' in s))).toBe(true);
  });
  it('puts a picked lineage, feat or subclass in entries', () => {
    const lin = cat.byId.get('trait/elf/elven-lineage')!;
    expect(resolveChoices(cat, lin, { lin: ['trait/elf/wood-elf'] }).entries).toEqual([{ entry: cat.byId.get('trait/elf/wood-elf') }]);
    expect(resolveChoices(cat, lin, { lin: ['trait/elf/nope'] }).entries).toEqual([]);
  });
  it('lands picks no grant uses as proficiencies or notes', () => {
    const soldier = cat.byId.get('background/soldier')!;
    expect(resolveChoices(cat, soldier, { abil: ['o1', 'o1', 'o3'], tool: ['Dice'] }).specs).toContainEqual(
      { id: 'tool-0', kind: 'prof', name: 'Gaming Set: Dice', cat: 'tool', target: 'Dice' });
    const skilled = cat.byId.get('feat/skilled')!;
    const r = resolveChoices(cat, skilled, { c1: ['stealth', 'arcana', 'Lute'] });
    expect(r.specs.map((s) => [s.id, s.cat, s.target])).toEqual([['c1-0', 'skill', 'stealth'], ['c1-1', 'skill', 'arcana'], ['c1-2', 'tool', 'Lute']]);
    const skillful = cat.byId.get('trait/human/skillful')!;
    expect(resolveChoices(cat, skillful, { c1: ['stealth'] }).specs).toEqual([expect.objectContaining({ cat: 'skill', target: 'stealth' })]);
    const meta = cat.byId.get('feature/sorcerer/metamagic')!;
    const m = resolveChoices(cat, meta, { meta: ['feature/sorcerer/quickened-spell', 'feature/sorcerer/twinned-spell'] });
    // The picks land as entries; the only spec is Metamagic's own row, which spends Sorcery Points.
    expect(m.specs.map((s) => s.name)).toEqual(['Metamagic']);
    expect(m.entries.map((x) => x.entry.id)).toEqual(['feature/sorcerer/quickened-spell', 'feature/sorcerer/twinned-spell']);
    const note: FeatureEntry = { id: 'feature/x/y', kind: 'feature', name: 'Y', src: 'srd', desc: '', cls: 'x', lvl: 1, grants: [{ kind: 'choice', id: 'c', name: 'Things', pick: 1, pool: 'other:any' }] };
    expect(resolveChoices(cat, note, { c: ['Typed'] }).notes).toEqual(['Things: Typed']);
  });
  it('refuses a grant that copies over two multi-pick choices', () => {
    const e: FeatureEntry = { id: 'feature/test/two', kind: 'feature', name: 'Two', src: 'srd', desc: 'Invented.', cls: 'test', lvl: 1,
      grants: [{ kind: 'choice', id: 'a', name: 'A', pick: 2, pool: 'skill:any' }, { kind: 'choice', id: 'b', name: 'B', pick: 2, pool: 'skill:any' },
        { id: 'g1', kind: 'checkBonus', name: 'X', target: '$a', val: '$b' }] };
    expect(() => resolveChoices(cat, e, { a: ['stealth', 'arcana'], b: ['1', '2'] })).toThrow();
  });
});

describe('prereqMet', () => {
  const ilyra = sampleCharacter();
  const named = (name: string, cid?: string): Character => ({ ...blankCharacter(), feats: [{ id: 'x', g: 'class', name, desc: '', ...(cid ? { cid } : {}) }] });
  it('reads features by catalog id, or by name when they have none', () => {
    expect(prereqMet(ilyra, 'feature=spellcasting').ok).toBe(true);
    expect(prereqMet(ilyra, 'feature=fighting-style').ok).toBe(true);
    expect(prereqMet({ ...ilyra, feats: ilyra.feats.filter((f) => f.cid !== 'feature/ranger/fighting-style') }, 'feature=fighting-style').ok).toBe(false);
    expect(prereqMet(named('Fighting Style · Archery'), 'feature=fighting-style').ok).toBe(true);
    expect(prereqMet(named('Spellcasting Focus'), 'feature=spellcasting').ok).toBe(false);
    expect(prereqMet(named('Pact Magic', 'feature/warlock/pact-magic'), 'feature=spellcasting|pact-magic').ok).toBe(true);
    expect(prereqMet(blankCharacter(), 'feature=spellcasting|pact-magic')).toEqual({ ok: false, missing: ['Spellcasting or Pact Magic feature'] });
  });
  it('reads scores, levels and armor training', () => {
    const weak = { ...blankCharacter(), abil: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
    expect(prereqMet(weak, 'str>=13')).toEqual({ ok: false, missing: ['Strength 13 or higher'] });
    expect(prereqMet(weak, 'lvl>=4')).toEqual({ ok: false, missing: ['Level 4 or higher'] });
    expect(prereqMet(ilyra, 'armor=medium').ok).toBe(true);
    expect(prereqMet(ilyra, 'armor=heavy').ok).toBe(false);
    expect(prereqMet(ilyra, undefined)).toEqual({ ok: true, missing: [] });
  });
});

describe('countedDefault', () => {
  const c = { ...blankCharacter(), acMods: [{ id: 'm1', name: 'Ring', val: 1 }] };
  const ring = E('item/ring-of-protection');
  const feat: Entry = { id: 'feat/test-ward', kind: 'feat', name: 'Ward', src: 'srd', desc: 'Invented.', cat: 'general', grants: [] };
  it('starts on only for an AC bonus of a feature-like entry when custom AC bonuses exist', () => {
    expect(countedDefault(c, ring, { id: 'g1', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1' })).toBe(false);
    expect(countedDefault(c, feat, { id: 'g1', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1' })).toBe(true);
    expect(countedDefault(c, feat, { id: 'g2', kind: 'abil', name: 'DEX +1', ab: 'dex', val: '1', cap: 20 })).toBe(false);
    expect(countedDefault(blankCharacter(), feat, { id: 'g1', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1' })).toBe(false);
  });
});

describe('scaled picks and option features', () => {
  const opt = (name: string, of: FeatureEntry['of'], extra: Partial<FeatureEntry> = {}): FeatureEntry =>
    ({ id: `feature/warlock/${name}`, kind: 'feature', name, src: 'srd', desc: '', cls: 'warlock', lvl: 1, of, grants: [], ...extra });
  const host: FeatureEntry = { id: 'feature/warlock/host', kind: 'feature', name: 'Host', src: 'srd', desc: '', cls: 'warlock', lvl: 1,
    grants: [{ kind: 'choice', id: 'c', name: 'Options', pick: 1, pickAt: '1:1,5:3', pool: 'feature:of=invocation' }] };
  const low = opt('low', 'invocation'), high = opt('high', 'invocation', { lvl: 5, prereq: 'lvl>=5' }), other = opt('other', 'metamagic');
  const one = opt('rep', 'invocation', { repeat: true });
  const local = mergeCatalog([low, high, other, one, host], null);
  it('offers only the pool\'s options, marking unmet prerequisites', () => {
    const opts = poolOptions(local, withClass({ ...blankCharacter()}, { lvl: 1 }), 'feature:of=invocation', {});
    expect(opts.map((o) => o.value).sort()).toEqual([high.id, low.id, one.id].sort());
    expect(opts.find((o) => o.value === high.id)?.unmet).toEqual(['Level 5 or higher']);
    expect(poolOptions(local, withClass({ ...blankCharacter()}, { lvl: 5 }), 'feature:of=invocation', {}).find((o) => o.value === high.id)?.unmet).toBeUndefined();
  });
  it('sets the number of picks from the character at the time of adding', () => {
    const ch = (lv: number) => atLevel(withClass({ ...blankCharacter()}, { lvl: lv }), host);
    expect((ch(1) as FeatureEntry).grants[0]).toMatchObject({ pick: 1 });
    expect((ch(5) as FeatureEntry).grants[0]).toMatchObject({ pick: 3 });
  });
  it('adds a picked option as its own feature, and a repeatable one stays pickable', () => {
    const c0 = withClass({ ...blankCharacter()}, { lvl: 1 });
    const c1 = addFromCatalog(c0, local, host, { picks: { c: [low.id] }, counted: {}, links: {} });
    expect(c1.feats.map((f) => f.cid)).toEqual(expect.arrayContaining([host.id, low.id]));
    const opts = poolOptions(local, c1, 'feature:of=invocation', {});
    expect(opts.find((o) => o.value === low.id)?.taken).toBe(true);
    const c2 = addFromCatalog(c1, local, one, { picks: {}, counted: {}, links: {} });
    expect(poolOptions(local, c2, 'feature:of=invocation', {}).find((o) => o.value === one.id)?.taken).toBeUndefined();
  });
  it('lists options with their prerequisites in the class features, after the rest', () => {
    const c = withClass(blankCharacter(), { name: 'Warlock', lvl: 1 });
    const classCat = mergeCatalog([...srdEntries.filter((e) => e.kind === 'class'), low, high, host], null);
    const rows = featureCandidates(classCat, c, 'class');
    expect(rows.map((r) => r.entry.id)).toEqual([host.id, low.id, high.id]);
    expect(rows[2]).toMatchObject({ ok: false, note: 'Level 5 or higher' });
  });
});

describe('a skill:proficient pool reads the entry\'s own skills', () => {
  const base = { kind: 'feat', cat: 'general', src: 'srd', desc: '' };
  const exp = { kind: 'choice', id: 'exp', name: 'Expertise', pick: 1, pool: 'skill:proficient' };
  const expGrant = { id: 'gx', kind: 'prof', name: 'Expertise', cat: 'expertise', target: '$exp' };
  const featA = { ...base, id: 'feat/own-a', name: 'Own A', grants: [{ id: 'g1', kind: 'prof', name: 'Athletics', cat: 'skill', target: 'athletics' }, exp, expGrant] } as Entry;
  const featB = { ...base, id: 'feat/own-b', name: 'Own B', grants: [{ kind: 'choice', id: 'c2', name: 'Skill', pick: 1, pool: 'skill:any' }, exp, expGrant] } as Entry;
  const ans = (picks: Record<string, string[]>): AddChoices => ({ picks, counted: {}, links: {} });

  it('own skills: a flat skill grant is offered, needed and takes Expertise', () => {
    const c = blankCharacter();
    expect(poolOptions(cat, c, 'skill:proficient', {}, [featA]).map((o) => o.value)).toEqual(['athletics']);
    expect(missingPicks(cat, c, featA, {})).toEqual(['exp']);
    const sheet = addFromCatalog(c, cat, featA, ans({ exp: ['athletics'] }));
    expect(skillLevel(sheet, 'athletics').level).toBe(2);
  });
  it('own skills: a picked skill is offered only once picked, never at Expertise already', () => {
    const c = blankCharacter(), offered = (ch: Character, picks: Record<string, string[]>) => poolOptions(cat, ch, 'skill:proficient', picks, [featB]).map((o) => o.value);
    expect(offered(c, { c2: ['stealth'] })).toContain('stealth');
    expect(offered(c, {})).not.toContain('stealth');
    expect(offered(withSkills([], { skillProf: { stealth: 2 } }), { c2: ['stealth'] })).not.toContain('stealth');
  });
  it('own skills: an Expertise pick goes when the skill it depended on changes', () => {
    const c = blankCharacter(), picks = { c2: ['arcana'], exp: ['stealth'] };
    expect(missingPicks(cat, c, featB, picks)).toEqual(['exp']);
    expect(resolveChoices(cat, featB, picks, c).specs.filter((s) => s.cat === 'expertise')).toEqual([]);
    expect(resolveChoices(cat, featB, { c2: ['stealth'], exp: ['stealth'] }, c).specs.filter((s) => s.cat === 'expertise')).toHaveLength(1);
  });
});

describe('a feat:any pool', () => {
  const lvl = (level: number): Character => (withClass({ ...blankCharacter() }, { lvl: level }));
  const opt = (c: Character, id: string) => poolOptions(cat, c, 'feat:any', {}).find((o) => o.value === id)!;
  it('lists every feat, whatever its category', () => {
    expect(poolOptions(cat, lvl(5), 'feat:any', {})).toHaveLength(entriesOf(cat, 'feat').length);
    expect(opt(lvl(5), 'feat/alert')).toBeTruthy();
    expect(opt(lvl(5), 'feat/ability-score-improvement')).toBeTruthy();
  });
  it('marks a boon the level misses, and keeps it selectable', () => {
    const boon = entriesOf(cat, 'feat').find((e) => e.cat === 'boon')!;
    expect(opt(lvl(1), boon.id).unmet).toBeTruthy();
    expect(opt(lvl(19), boon.id).unmet).toBeUndefined();
  });
  it('marks a feat on the sheet, but never a repeatable one', () => {
    const none = { picks: {}, counted: {}, links: {} };
    const alert = addFromCatalog(lvl(5), cat, cat.byId.get('feat/alert')!, none);
    expect(opt(alert, 'feat/alert').taken).toBe(true);
    const asi = cat.byId.get('feat/ability-score-improvement')!;
    const c: Character = { ...lvl(5), feats: [{ id: 'f', g: 'feat', name: asi.name, desc: '', cid: asi.id }] };
    expect(opt(c, asi.id).taken).toBeUndefined();
  });
});

describe('choices that depend on another choice', () => {
  const ans = (picks: Record<string, string[]>): AddChoices => ({ picks, counted: {}, links: {} });
  const groupValue = (e: Entry, label: string) => optionGroups(choice(e, 'order')).find((g) => g.label === label)!.value;
  it('Thaumaturge asks for a Cleric cantrip, Protector does not', () => {
    const c = blankCharacter(), e = E('feature/cleric/divine-order');
    const thaum = groupValue(e, 'Thaumaturge'), prot = groupValue(e, 'Protector');
    expect(missingPicks(cat, c, e, { order: [thaum] })).toEqual(['cantrip']);
    expect(missingPicks(cat, c, e, { order: [prot] })).toEqual([]);
    expect(addFromCatalog(c, cat, e, ans({ order: [thaum], cantrip: ['spell/guidance'] })).spells.map((s) => s.cid)).toEqual(['spell/guidance']);
    // The controlling pick changed after the cantrip was picked: no spell, no error.
    expect(addFromCatalog(c, cat, e, ans({ order: [prot], cantrip: ['spell/guidance'] })).spells).toEqual([]);
  });
  it('Magician asks for a Druid cantrip, Warden does not', () => {
    const c = blankCharacter(), e = E('feature/druid/primal-order');
    expect(missingPicks(cat, c, e, { order: [groupValue(e, 'Magician')] })).toEqual(['cantrip']);
    expect(missingPicks(cat, c, e, { order: [groupValue(e, 'Warden')] })).toEqual([]);
  });
  it.each([['paladin', 'blessed-warrior', ['spell/guidance', 'spell/sacred-flame'], 'cha'], ['ranger', 'druidic-warrior', ['spell/guidance', 'spell/produce-flame'], 'wis']])(
    '%s Fighting Style: %s gives two cantrips, the feat option asks for a style', (cls, how, cantrips, ab) => {
      const c = blankCharacter(), e = E(`feature/${cls}/fighting-style`);
      const sheet = addFromCatalog(c, cat, e, ans({ how: [how as string], cantrips: cantrips as string[] }));
      expect(sheet.spells.map((s) => [s.cid, s.castAb])).toEqual((cantrips as string[]).map((id) => [id, ab]));
      expect(missingPicks(cat, c, e, { how: ['feat'] })).toEqual(['style']);
      expect(missingPicks(cat, c, e, { how: [how as string] })).toEqual(['cantrips']);
    });
  it('Fighting Style is not named after its feat option', () => {
    const e = E('feature/paladin/fighting-style');
    expect(featureName(cat, blankCharacter(), e, { how: ['blessed-warrior'] })).toBe('Fighting Style');
    expect(poolOptions(cat, blankCharacter(), choice(e, 'how').pool!, {}).map((o) => o.label)).toEqual(['Feat', 'Blessed Warrior']);
  });
  it('choiceActive follows the chain, and is true with no ifPick', () => {
    const e = { id: 'feat/x', kind: 'feat', name: 'X', cat: 'general', src: 'srd', desc: '', grants: [
      { kind: 'choice', id: 'a', name: 'A', pick: 1, pool: 'list:x|y' },
      { kind: 'choice', id: 'b', name: 'B', pick: 1, pool: 'list:p|q', ifPick: 'a=x' },
      { kind: 'choice', id: 'c', name: 'C', pick: 1, pool: 'skill:any', ifPick: 'b=p' }] } as Entry;
    expect(choiceActive(e, choice(e, 'a'), {})).toBe(true);
    expect(choiceActive(e, choice(e, 'c'), { a: ['x'], b: ['p'] })).toBe(true);
    expect(choiceActive(e, choice(e, 'c'), { a: ['y'], b: ['p'] })).toBe(false);
  });
});

// ---- Task 5: class and subclass ids ----
describe('matching names to catalog ids', () => {
  const srdOnly = cat;
  const withCh = (row: Partial<ClassRow>): Character => withClass(blankCharacter(), row);
  it('matches a class, species or subclass by name', () => {
    expect(matchId(cat, 'class', ' ranger ')).toBe('class/ranger');
    expect(matchId(cat, 'species', 'Wood Elf')).toBe('species/elf');
    expect(matchId(cat, 'species', 'Elf')).toBe('species/elf');
    expect(matchId(srdOnly, 'species', 'Aasimar')).toBe('');
    expect(matchId(cat, 'subclass', 'Hunter', 'class/ranger')).toBe('subclass/ranger/hunter');
    expect(matchId(cat, 'subclass', 'Hunter', 'class/druid')).toBe('');
  });
  it('finds the class and subclass of an old save by name', () => {
    expect(classIdOf(cat, withCh({ name: 'Ranger' }))).toBe('class/ranger');
    expect(subclassIdOf(cat, withCh({ name: 'Ranger', sub: 'Hunter' }))).toBe('subclass/ranger/hunter');
    expect(classIdOf(cat, withCh({ name: 'Ranger', clsId: 'class/nope' }))).toBe('class/ranger');
    expect(classIdOf(cat, withCh({ name: 'Whatever', clsId: 'class/druid' }))).toBe('class/druid');
    expect(subclassIdOf(cat, withCh({ name: 'Druid', clsId: 'class/druid', sub: 'Circle of the Stars', subId: 'subclass/druid/circle-of-the-stars' }))).toBe('');
  });
  it('fills the subclass name and id from a subclass choice, never over a typed one', () => {
    const c = addFromCatalog(withCh({ name: 'Ranger' }), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    expect([c.classes[0].sub, c.classes[0].subId]).toEqual(['Hunter', 'subclass/ranger/hunter']);
    const typed = addFromCatalog(withCh({ name: 'Ranger', sub: 'Gloom Stalker', subId: '' }), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    expect([typed.classes[0].sub, typed.classes[0].subId]).toEqual(['Gloom Stalker', '']);
  });
  it('names a spell’s class source through the class id', () => {
    const c = addFromCatalog(withCh({ name: '', clsId: 'class/wizard' }), cat, E('spell/fireball'), A());
    expect(c.spells[0]).toMatchObject({ srcKind: 'class', srcName: 'Wizard' });
  });
});

// ---- Task 8: feature candidates ----
describe('featureCandidates', () => {
  const r5 = (over: Partial<ClassRow> = {}): Character => withClass(blankCharacter(), { name: 'Ranger', clsId: 'class/ranger', lvl: 5, ...over });
  const find = (xs: ReturnType<typeof featureCandidates>, id: string) => xs.find((x) => x.entry.id === id);
  it('lists the class’s features by level, marking those above the character’s', () => {
    const xs = featureCandidates(cat, r5(), 'class');
    expect(find(xs, 'feature/ranger/extra-attack')).toMatchObject({ ok: true });
    expect(find(xs, 'feature/ranger/expertise')).toMatchObject({ ok: false, note: 'Level 9' });
    expect(xs.some((x) => x.entry.id.startsWith('feature/ranger/hunter/'))).toBe(false);
    const lv = xs.map((x) => (x.entry as FeatureEntry).lvl);
    expect(lv).toEqual([...lv].sort((a, b) => a - b));
    expect(featureCandidates(cat, r5({ clsId: '' }), 'class').map((x) => x.entry.id)).toEqual(xs.map((x) => x.entry.id));
  });
  it('lists the subclass’s features', () => {
    const xs = featureCandidates(cat, r5({ sub: 'Hunter', subId: 'subclass/ranger/hunter' }), 'sub');
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((x) => x.entry.id.startsWith('feature/ranger/hunter/'))).toBe(true);
  });
  it('marks feats whose prerequisites aren’t met, and taken ones', () => {
    const weak = { ...r5(), abil: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
    const g = find(featureCandidates(cat, weak, 'feat', 'general'), 'feat/grappler')!;
    expect(g.ok).toBe(false);
    expect(g.note).toContain('Strength or Dexterity 13');
    expect(find(featureCandidates(cat, sampleCharacter(), 'feat', 'general'), 'feat/grappler')!.ok).toBe(true);
    expect(find(featureCandidates(cat, withClass({ ...r5()}, { lvl: 3 }), 'feat', 'general'), 'feat/ability-score-improvement')).toMatchObject({ ok: false, note: 'Level 4 or higher' });
    const general = featureCandidates(cat, weak, 'feat', 'general');
    const okFlags = general.map((x) => x.ok);
    expect(okFlags).toEqual([...okFlags].sort((a, b) => Number(b) - Number(a)));
    const alert = (feats: Character['feats']) => find(featureCandidates(cat, { ...blankCharacter(), feats }, 'feat', 'origin'), 'feat/alert')!;
    expect(alert([{ id: 'x', g: 'feat', name: 'Alert', desc: '', cid: 'feat/alert' }])).toMatchObject({ taken: true, ok: true });
    expect(alert([{ id: 'x', g: 'feat', name: 'Alert', desc: '' }]).taken).toBe(true);
    expect(alert([]).taken).toBe(false);
    const mi = find(featureCandidates(cat, { ...blankCharacter(), feats: [{ id: 'x', g: 'feat', name: 'Magic Initiate (Druid)', desc: '', cid: 'feat/magic-initiate' }] }, 'feat', 'origin'), 'feat/magic-initiate')!;
    expect(mi.taken).toBe(false);
  });
  it('lists the traits of the character’s species, and every background', () => {
    const elf = featureCandidates(cat, { ...blankCharacter(), ch: { ...blankCharacter().ch, species: 'Wood Elf' } }, 'species');
    expect(elf.map((x) => x.entry.id)).toContain('trait/elf/keen-senses');
    expect(elf.some((x) => x.entry.id === 'trait/elf/wood-elf')).toBe(false);
    expect(featureCandidates(cat, blankCharacter(), 'background').map((x) => x.entry.id)).toContain('background/acolyte');
  });
});

describe('featBenefits (spec 2026-11-10 §1.3)', () => {
  const desc = (id: string) => E(id).desc;
  it('lists the benefit headings', () => {
    expect(featBenefits(desc('feat/alert'))).toBe('Initiative Proficiency, Initiative Swap');
    expect(featBenefits(desc('feat/magic-initiate'))).toBe('Two Cantrips, Level 1 Spell, Spell Change');
  });
  it('leaves out Repeatable', () => {
    expect(featBenefits('You gain the following benefits.\nTough Hide. You have thick skin.\nRepeatable. You can take this feat more than once.')).toBe('Tough Hide');
  });
  it('without the marker line gives the first sentence', () => {
    expect(featBenefits(desc('feat/savage-attacker'))).toBe(firstSentence(desc('feat/savage-attacker')));
    expect(featBenefits(desc('feat/skilled'))).toBe(firstSentence(desc('feat/skilled')));
  });
  it('with the marker but no heading gives the first line after it, never the marker or empty', () => {
    expect(featBenefits('You gain the following benefits.\nRepeatable. You can take this feat more than once.')).toBe('Repeatable.');
  });
  it('every SRD origin feat gives a non-empty result; headings are at most four words', () => {
    const feats = entriesOf(cat, 'feat').filter((f) => f.cat === 'origin');
    expect(feats.length).toBeGreaterThan(2);
    for (const f of feats) {
      const r = featBenefits(f.desc);
      expect(r, f.id).not.toBe('');
      if (f.desc.includes('You gain the following benefits.')) for (const part of r.split(', ')) expect(part.split(' ').length, f.id + ': ' + part).toBeLessThanOrEqual(4);
    }
  });
});


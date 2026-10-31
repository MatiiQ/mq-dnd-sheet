import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { blankCharacter, sampleCharacter } from '../defaults';
import { migrate } from '../logic';
import { saveEntry } from '../sheet';
import type { Character, Item, Spell } from '../types';
import { mergeCatalog } from './merge';
import type { Entry, FeatureEntry, ItemEntry, SpellEntry } from './schema';
import {
  BLANK_ITEM, catForKind, choicesOf, freeText, itemFromEntry, itemFromForm, missingPicks, needed, optionGroups, poolOptions, prereqMet, resolveChoices,
  spellFromEntry, spellSummary, validPicks, type ItemDraft
} from './copy';

const cat = mergeCatalog(srdEntries, null);
const get = <T extends Entry>(id: string) => { const e = cat.byId.get(id); if (!e) throw new Error('no ' + id); return e as T; };
const spell = (id: string) => get<SpellEntry>(id);
const item = (id: string) => get<ItemEntry>(id);
const without = <T extends object>(x: T, ...keys: string[]) => Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k)));
const draft = (p: Partial<ItemDraft>): ItemDraft => ({ ...BLANK_ITEM, ...p });

describe('spellFromEntry', () => {
  it('copies Fireball with its mechanics and a summary', () => {
    const sp = spellFromEntry(spell('spell/fireball'));
    expect(sp).toMatchObject({ name: 'Fireball', lvl: 3, time: 'Action', range: '150 feet', save: 'dex', fx: 'damage', dmg: '8d6', dtype: 'Fire',
      cid: 'spell/fireball', school: 'Evocation', c: false, ritual: false, prep: true, dice: '8d6 Fire · DEX save' });
    expect(sp.desc).toBe(spell('spell/fireball').desc);
  });
  it('copies an AC effect', () => {
    expect(spellFromEntry(spell('spell/shield-of-faith'))).toMatchObject({ acFx: 'bonus', acVal: 2, c: true });
  });
  it('marks a cantrip prepared, so migrate() leaves it as it is', () => {
    const sp = spellFromEntry(spell('spell/fire-bolt'));
    expect(sp.prep).toBe(true);
    const c = migrate({ ...blankCharacter(), spells: [{ id: 's1', ...sp }] });
    expect(c.spells[0]).toEqual({ id: 's1', ...sp });
  });
  it('leaves a spell entry’s grants out', () => {
    const sp = spellFromEntry(spell('spell/shillelagh')) as Record<string, unknown>;
    expect(sp.grants).toBeUndefined();
    expect(Object.values(sp).every((v) => v === null || typeof v !== 'object')).toBe(true);
  });
});

describe('spellSummary', () => {
  it('names damage with a save or an attack, healing, or nothing', () => {
    expect(spellSummary(spell('spell/fireball'))).toBe('8d6 Fire · DEX save');
    expect(spellSummary(spell('spell/fire-bolt'))).toBe('1d10 Fire · ranged attack');
    expect(spellSummary(spell('spell/cure-wounds'))).toBe('2d8 healing');
    expect(spellSummary(spell('spell/guidance'))).toBe('');
    const base = spell('spell/fire-bolt');
    expect(spellSummary({ ...base, atk: undefined, save: undefined })).toBe('1d10 Fire');
    expect(spellSummary({ ...base, atk: 'melee', dtype: undefined })).toBe('1d10 · melee attack');
  });
});

describe('itemFromEntry', () => {
  it('copies a weapon', () => {
    expect(itemFromEntry(item('item/longsword'))).toMatchObject({ name: 'Longsword', qty: 1, eq: false, cat: 'weapon', cost: '15 GP', wcat: 'martial',
      wrange: 'melee', dmg: '1d8', dtype: 'Slashing', vers: '1d10', props: 'versatile', mastery: 'sap', wt: 3, cid: 'item/longsword' });
    expect('desc' in itemFromEntry(item('item/longsword'))).toBe(false);
  });
  it('copies armor, a container and charges', () => {
    expect(itemFromEntry(item('item/chain-mail'))).toMatchObject({ armor: 'heavy', acBase: 16, strReq: 13, stealthDis: true });
    expect(itemFromEntry(item('item/bag-of-holding'))).toMatchObject({ xdim: true, cap: 500, cat: 'magic' });
    expect(itemFromEntry(item('item/wand-of-magic-missiles'))).toMatchObject({ count: 7, max: 7, recharge: 'dawn', regain: '1d6+1', regainOn: 'dawn' });
  });
  it('gives Ring of Protection no acBonus (its AC is a grant, added with it)', () => {
    const r = itemFromEntry(item('item/ring-of-protection')) as Record<string, unknown>;
    expect(r.acBonus).toBeUndefined();
    expect(r.grants).toBeUndefined();
  });
  it('reads a formula charges maximum as maxV, with no charges yet', () => {
    const e: ItemEntry = { id: 'item/test-rod', kind: 'item', name: 'Test Rod', src: 'srd', desc: 'Invented.', cat: 'magic', charges: 'pb', recharge: 'long' };
    const it = itemFromEntry(e);
    expect(it).toMatchObject({ maxV: 'pb', count: 0 });
    expect(it.max).toBeUndefined();
  });
  it('copies a magic weapon or armor’s base item fields, and its base id', () => {
    expect(itemFromEntry(item('item/dagger-of-venom'))).toMatchObject({ cat: 'magic', dmg: '1d4', props: 'finesse,light,thrown', thrown: '20/60',
      mastery: 'nick', wt: 1, base: 'item/dagger' });
    expect(itemFromEntry(item('item/plate-armor-of-etherealness'))).toMatchObject({ armor: 'heavy', acBase: 18, strReq: 15, stealthDis: true });
  });
  it('never guesses a base for armor or a weapon of the player’s choice', () => {
    const a = itemFromEntry(item('item/armor-1-2-or-3'));
    for (const k of ['armor', 'acBase', 'dmg', 'base'] as const) expect(a[k]).toBeUndefined();
    expect(itemFromEntry(item('item/weapon-1-2-or-3')).base).toBeUndefined();
  });
});

describe('itemFromForm', () => {
  it('a custom Longsword equals the catalog one', () => {
    const d = draft({ kind: 'weapon', cat: catForKind('weapon'), name: 'Longsword', wt: '3', wcat: 'martial', wrange: 'melee', dmg: '1d8', dtype: 'Slashing',
      props: ['versatile'], versDie: '1d10', mastery: 'sap' });
    expect(itemFromForm(d)).toEqual(without(itemFromEntry(item('item/longsword')), 'cid', 'cost', 'eq'));
    expect('eq' in itemFromForm(d)).toBe(false);
  });
  it('a custom Longbow sorts its properties and writes ammunition', () => {
    const d = draft({ kind: 'weapon', cat: 'weapon', name: 'Longbow', wt: '2', wcat: 'martial', wrange: 'ranged', dmg: '1d8', dtype: 'Piercing',
      props: ['ammunition', 'two-handed', 'heavy'], ammoRange: '150/600', ammoType: 'Arrow', mastery: 'slow' });
    expect(itemFromForm(d)).toEqual(without(itemFromEntry(item('item/longbow')), 'cid', 'cost', 'eq'));
  });
  it('a custom Dagger writes its thrown range', () => {
    const d = draft({ kind: 'weapon', cat: 'weapon', name: 'Dagger', wt: '1', wcat: 'simple', wrange: 'melee', dmg: '1d4', dtype: 'Piercing',
      props: ['finesse', 'light', 'thrown'], thrownRange: '20/60', mastery: 'nick' });
    expect(itemFromForm(d)).toEqual(without(itemFromEntry(item('item/dagger')), 'cid', 'cost', 'eq'));
  });
  it('copies cat as the draft holds it, never derives it', () => {
    expect(itemFromForm(draft({ kind: 'container', cat: 'magic', name: 'Bag of Holding', xdim: true, cap: '500' })).cat).toBe('magic');
  });
  it('edits clear what the form cleared, and keep eq', () => {
    const sword: Item = { id: 'i1', ...itemFromEntry(item('item/longsword')), eq: true };
    const asNone = saveEntry<Item>([sword], itemFromForm(draft({ kind: 'none', cat: 'weapon', name: 'Longsword', cid: 'item/longsword', cost: '15 GP' })), 'i1')[0];
    for (const k of ['wcat', 'wrange', 'dmg', 'dtype', 'vers', 'props', 'mastery'] as const) expect(asNone[k]).toBeUndefined();
    expect(asNone.eq).toBe(true);
    const dagger: Item = { id: 'i2', ...itemFromEntry(item('item/dagger')) };
    const bare = saveEntry<Item>([dagger], itemFromForm(draft({ kind: 'weapon', cat: 'weapon', name: 'Dagger', wcat: 'simple', wrange: 'melee', dmg: '1d4', props: [] })), 'i2')[0];
    expect(bare.props).toBeUndefined();
    expect(bare.thrown).toBeUndefined();
    const rope: Item = { id: 'i3', name: 'Rope', qty: 1, eq: false, desc: 'Fifty feet.' };
    expect(saveEntry<Item>([rope], itemFromForm(draft({ name: 'Rope', desc: '' })), 'i3')[0].desc).toBeUndefined();
  });
});

describe('catForKind', () => {
  it('maps the form’s kind to a catalog category', () => {
    expect(catForKind('weapon')).toBe('weapon');
    expect(catForKind('armor', 'heavy')).toBe('armor');
    expect(catForKind('armor', 'shield')).toBe('shield');
    expect(catForKind('container')).toBe('gear');
    expect(catForKind('none')).toBe('gear');
  });
});

describe('migrate() and catalog fields', () => {
  const load = (inv: Record<string, unknown>[], spells: Record<string, unknown>[] = []) => migrate({ ...blankCharacter(), inv, spells });
  it('keeps a formula charges maximum and drops a die', () => {
    expect(load([{ id: 'i1', name: 'Rod', qty: 1, eq: false, count: 2, maxV: 'pb' }]).inv[0].maxV).toBe('pb');
    expect(load([{ id: 'i1', name: 'Rod', qty: 1, eq: false, count: 2, maxV: '1d6' }]).inv[0].maxV).toBeUndefined();
  });
  it('drops a bad catalog field and keeps the entry', () => {
    const c = load(
      [{ id: 'i1', name: 'Sword', qty: 1, eq: false, wcat: 'exotic', magic: '1', cat: 'vehicle', cost: 15, dmg: '1d8', base: 'dagger' },
        { id: 'i2', name: 'Venom', qty: 1, eq: false, base: 'item/dagger', magic: 1, props: 'finesse' }],
      [{ id: 's1', name: 'Bolt', lvl: 0, time: 'Action', range: '', atk: 'thrown', save: 'dex', fx: 'damage', ritual: 'no' }]
    );
    const [i1, i2] = c.inv as (Item & Record<string, unknown>)[];
    expect(i1).toMatchObject({ id: 'i1', name: 'Sword', dmg: '1d8' });
    for (const k of ['wcat', 'magic', 'cat', 'cost', 'base']) expect(i1[k]).toBeUndefined();
    expect(i2).toMatchObject({ base: 'item/dagger', magic: 1, props: 'finesse' });
    const s1 = c.spells[0] as Spell & Record<string, unknown>;
    expect(s1).toMatchObject({ name: 'Bolt', save: 'dex', fx: 'damage' });
    expect(s1.atk).toBeUndefined();
    expect(s1.ritual).toBeUndefined();
  });
});

// ---- Task 3: choices and prerequisites ----
const choice = (e: Entry, id: string) => choicesOf(e).find((x) => x.id === id)!;
const withSkills = (keys: string[], over: Partial<Character> = {}): Character => ({ ...blankCharacter(), skillProf: Object.fromEntries(keys.map((k) => [k, 1])), ...over });

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
  it('lists the tools of a group, never the generic ones', () => {
    expect(poolOptions(cat, blank, 'tool:gaming-set', {}).map((o) => o.value).sort()).toEqual(['Dice', 'Dragonchess', 'Playing Cards', 'Three-Dragon Ante']);
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
    const c = { ...blankCharacter(), level: 5, abil: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
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
  it('resolves Magic Initiate: spells with their ability, and the free cast of the level 1 spell', () => {
    const r = resolveChoices(cat, mi, { list: ['druid'], cantrips: ['spell/guidance', 'spell/produce-flame'], spell1: ['spell/goodberry'], ab: ['wis'] });
    const spells = r.specs.filter((s) => s.kind === 'spell');
    expect(spells).toEqual([
      expect.objectContaining({ id: 'g1-0', spell: 'spell/guidance', castAb: 'wis' }),
      expect.objectContaining({ id: 'g1-1', spell: 'spell/produce-flame', castAb: 'wis' }),
      expect.objectContaining({ id: 'g2', spell: 'spell/goodberry', castAb: 'wis', always: true })
    ]);
    expect(r.specs.find((s) => s.kind === 'resource')).toMatchObject({ id: 'g3', casts: 'g2' });
    expect(JSON.stringify(r.specs)).not.toContain('$');
  });
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
  it('turns a free-text spell pick into a spell named by the text', () => {
    const e: FeatureEntry = { id: 'feature/test/moon', kind: 'feature', name: 'Moon', src: 'srd', desc: 'Invented.', cls: 'test', lvl: 1,
      grants: [{ kind: 'choice', id: 'sp', name: 'Spell', pick: 1, pool: 'spell:lvl~3' }, { id: 'g1', kind: 'spell', name: 'Moon spell', spell: '$sp' }] };
    expect(resolveChoices(cat, e, { sp: ['Moonbeam Arrow'] }).specs).toEqual([expect.objectContaining({ id: 'g1', spell: 'Moonbeam Arrow' })]);
  });
  it('drops a grant whose choice has no picks, and keeps the others (Deft Explorer)', () => {
    const deft = cat.byId.get('feature/ranger/deft-explorer')!;
    const c = blankCharacter();
    expect(missingPicks(cat, c, deft, { lang: ['Elvish', 'Dwarvish'] })).toEqual([]);
    const r = resolveChoices(cat, deft, { lang: ['Elvish', 'Dwarvish'] });
    expect(r.specs.map((s) => [s.cat, s.target])).toEqual([['language', 'Elvish'], ['language', 'Dwarvish']]);
    expect(JSON.stringify(r.specs)).not.toContain('$exp');
  });
  it('copies a resource per pick, each casting its own spell (Signature Spells)', () => {
    const sig = cat.byId.get('feature/wizard/signature-spells')!;
    const r = resolveChoices(cat, sig, { sig: ['spell/fireball', 'spell/counterspell'] });
    expect(r.specs.map((s) => s.id)).toEqual(['g1-0', 'g1-1', 'g2-0', 'g2-1']);
    expect(r.specs.filter((s) => s.kind === 'resource').map((s) => [s.max, s.casts])).toEqual([['1', 'g1-0'], ['1', 'g1-1']]);
  });
  it('keeps a casts that names a catalog spell (Favored Enemy)', () => {
    const fe = cat.byId.get('feature/ranger/favored-enemy')!;
    expect(resolveChoices(cat, fe, {}).specs.find((s) => s.kind === 'resource')!.casts).toBe('spell/hunters-mark');
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
    const m = resolveChoices(cat, meta, { meta: ['Quickened Spell', 'Twinned Spell'] });
    expect(m.specs).toEqual([]);
    expect(m.notes).toEqual(['Metamagic options: Quickened Spell, Twinned Spell']);
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

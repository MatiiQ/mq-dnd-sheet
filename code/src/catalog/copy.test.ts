import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { blankCharacter, sampleCharacter } from '../defaults';
import { armorClass, migrate, removeFeature, removeSpell } from '../logic';
import { inactiveReason, isActive } from '../links';
import { saveEntry } from '../sheet';
import type { Character, Item, Spell } from '../types';
import { mergeCatalog } from './merge';
import type { Entry, FeatureEntry, ItemEntry, SpellEntry } from './schema';
import {
  addFromCatalog, draftFromItem, featureCandidates, grantSpellName, withDetectedArmor, BLANK_ITEM, BLANK_SPELL, catForKind, countedDefault, draftFromSpell, spellFromForm, type SpellDraft, choicesOf, classIdOf, matchId, nestedEntries, subclassIdOf, type AddChoices, freeText, itemFromEntry, itemFromForm, missingPicks, needed, optionGroups, poolOptions, prereqMet, resolveChoices,
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

// ---- Task 4: adding from the catalog ----
const A = (picks: Record<string, string[]> = {}, nested?: Record<string, AddChoices>, more: Partial<AddChoices> = {}): AddChoices =>
  ({ picks, counted: {}, links: {}, ...(nested ? { nested } : {}), ...more });
const E = (id: string) => cat.byId.get(id)!;
const miDruid = { list: ['druid'], cantrips: ['spell/guidance', 'spell/produce-flame'], spell1: ['spell/goodberry'], ab: ['wis'] };
const fromOf = (c: Character, link: string) => ({
  spells: c.spells.filter((x) => x.from === link), grants: c.grants.filter((g) => g.from === link), res: c.res.filter((r) => r.from === link),
  feats: c.feats.filter((f) => f.from === link), senses: c.senses.filter((x) => x.from === link), defenses: c.defenses.filter((x) => x.from === link)
});

describe('addFromCatalog', () => {
  it('adds Magic Initiate with its spells named after the catalog spells, twice without merging', () => {
    const c1 = addFromCatalog(blankCharacter(), cat, E('feat/magic-initiate'), A(miDruid));
    expect(c1.feats).toHaveLength(1);
    const f = c1.feats[0];
    expect(f).toMatchObject({ g: 'feat', name: 'Magic Initiate (Druid)', cid: 'feat/magic-initiate' });
    const got = fromOf(c1, 'feature:' + f.id);
    expect(got.spells.map((x) => x.name)).toEqual(['Guidance', 'Produce Flame', 'Goodberry']);
    expect(got.spells.map((x) => [x.lvl, x.cid, x.castAb])).toEqual([[0, 'spell/guidance', 'wis'], [0, 'spell/produce-flame', 'wis'], [1, 'spell/goodberry', 'wis']]);
    expect(got.spells[0].time).toBe('Action');
    expect(got.spells[0].prep).toBe(false);
    expect(got.spells[2].always).toBe(true);
    expect(got.res).toHaveLength(1);
    expect(got.res[0].casts).toBe(got.spells[2].id);
    const c2 = addFromCatalog(c1, cat, E('feat/magic-initiate'),
      A({ list: ['wizard'], cantrips: ['spell/light', 'spell/fire-bolt'], spell1: ['spell/magic-missile'], ab: ['int'] }));
    expect(c2.feats.map((x) => x.name)).toEqual(['Magic Initiate (Druid)', 'Magic Initiate (Wizard)']);
    expect(c2.spells).toHaveLength(6);
    expect(c2.res).toHaveLength(2);
  });

  it('adds a background with its origin feat preset, and removing it removes both', () => {
    const blank = blankCharacter();
    expect(nestedEntries(cat, E('background/acolyte'), {})).toEqual([{ entry: E('feat/magic-initiate'), preset: { list: ['cleric'] } }]);
    const mi = A({ cantrips: ['spell/guidance', 'spell/sacred-flame'], spell1: ['spell/bless'], ab: ['wis'] });
    const c = addFromCatalog(blank, cat, E('background/acolyte'), A({ abil: ['o2', 'o2', 'o3'] }, { 'feat/magic-initiate': mi }));
    const bg = c.feats.find((f) => f.g === 'background')!;
    expect(bg).toMatchObject({ name: 'Acolyte', cid: 'background/acolyte' });
    expect(bg.desc).toContain('Equipment: ');
    expect(c.ch).toEqual(blank.ch);
    const g = fromOf(c, 'feature:' + bg.id).grants;
    expect(g.filter((x) => x.kind === 'abil').map((x) => x.ab)).toEqual(['wis', 'wis', 'cha']);
    expect(g.filter((x) => x.kind === 'prof').map((x) => x.target)).toEqual(['insight', 'religion', 'Calligrapher’s Supplies']);
    const feat = c.feats.find((f) => f.cid === 'feat/magic-initiate')!;
    expect(feat).toMatchObject({ name: 'Magic Initiate (Cleric)', from: 'feature:' + bg.id, srcKind: 'background' });
    expect(fromOf(c, 'feature:' + feat.id).spells.map((x) => x.name)).toEqual(['Guidance', 'Sacred Flame', 'Bless']);
    expect(fromOf(c, 'feature:' + feat.id).res).toHaveLength(1);
    expect(() => addFromCatalog(blank, cat, E('background/acolyte'), A({ abil: ['o2', 'o2', 'o3'] }))).toThrow();
    expect(() => addFromCatalog(blank, cat, E('background/acolyte'), A({}, { 'feat/magic-initiate': mi }))).toThrow();
    const gone = removeFeature(c, bg.id);
    expect(gone.feats).toEqual([]);
    expect(gone.spells).toEqual([]);
    expect(gone.grants).toEqual([]);
  });

  it('adds a subclass picked by a choice as its own feature, without its features', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    const top = c.feats.find((f) => f.cid === 'feature/ranger/ranger-subclass')!;
    expect(c.feats.find((f) => f.cid === 'subclass/ranger/hunter')).toMatchObject({ g: 'sub', name: 'Hunter', from: 'feature:' + top.id });
    expect(c.feats).toHaveLength(2);
  });

  it('points Favored Enemy’s resource at its new Hunter’s Mark', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/favored-enemy'), A());
    const hm = c.spells.find((x) => x.cid === 'spell/hunters-mark')!;
    expect(hm.name).toBe('Hunter’s Mark');
    expect(c.res[0].casts).toBe(hm.id);
  });

  it('adds Ring of Protection with an AC grant that needs it equipped and attuned', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('item/ring-of-protection'), A());
    const ring = c.inv[0];
    expect(ring.acBonus).toBeUndefined();
    expect(c.grants.find((g) => g.kind === 'ac')).toMatchObject({ from: 'item:' + ring.id, needEq: true, needAtt: true });
    const base = armorClass(c).total;
    const worn = { ...c, inv: [{ ...ring, eq: true }] };
    expect(armorClass(worn).total).toBe(base);
    expect(armorClass({ ...worn, attuneIds: [ring.id, '', ''] }).total).toBe(base + 1);
  });

  it('fills a formula charges maximum on adding', () => {
    const rod: ItemEntry = { id: 'item/test-rod', kind: 'item', name: 'Test Rod', src: 'srd', desc: 'Invented.', cat: 'magic', charges: 'pb', recharge: 'long' };
    const c = addFromCatalog({ ...blankCharacter(), level: 5 }, cat, rod, A());
    expect(c.inv[0]).toMatchObject({ maxV: 'pb', count: 3 });
  });

  it('adds Shillelagh with its own grant, removed with it', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('spell/shillelagh'), A());
    const sp = c.spells[0];
    expect(c.grants).toEqual([expect.objectContaining({ kind: 'atkAbil', from: 'spell:' + sp.id })]);
    expect(removeSpell(c, sp.id).grants).toEqual([]);
  });

  it('gives a spell granted by another entry its own grants, once, also when linked', () => {
    const picks = { ...miDruid, cantrips: ['spell/shillelagh', 'spell/guidance'] };
    const c = addFromCatalog(blankCharacter(), cat, E('feat/magic-initiate'), A(picks));
    const sh = c.spells.find((x) => x.cid === 'spell/shillelagh')!;
    expect(c.grants.filter((g) => g.kind === 'atkAbil')).toEqual([expect.objectContaining({ from: 'spell:' + sh.id })]);
    // Linked to a hand-made Shillelagh with no grants: it gets one.
    const hand: Character = { ...blankCharacter(), spells: [{ id: 'h1', name: 'Shillelagh', lvl: 0, time: 'Bonus Action', range: 'Self' }] };
    const linked = addFromCatalog(hand, cat, E('feat/magic-initiate'), A(picks, undefined, { links: { 'g1-0': 'h1' } }));
    expect(linked.spells.filter((x) => x.name === 'Shillelagh')).toHaveLength(1);
    expect(linked.grants.filter((g) => g.kind === 'atkAbil')).toEqual([expect.objectContaining({ from: 'spell:h1' })]);
    // Linked to one added from the picker, which already has it: still one.
    const picked = addFromCatalog(blankCharacter(), cat, E('spell/shillelagh'), A());
    const pid = picked.spells[0].id;
    const twice = addFromCatalog(picked, cat, E('feat/magic-initiate'), A(picks, undefined, { links: { 'g1-0': pid } }));
    expect(twice.grants.filter((g) => g.kind === 'atkAbil')).toHaveLength(1);
    const feat = twice.feats[0];
    const after = removeFeature(twice, feat.id);
    expect(after.spells.map((x) => x.id)).toEqual([pid]);
    expect(after.grants.filter((g) => g.kind === 'atkAbil')).toHaveLength(1);
  });

  it('adds a feature above the character’s level with minLvl, its grants inactive until then', () => {
    const r5 = withSkills(['stealth', 'survival'], { level: 5 });
    const c = addFromCatalog(r5, cat, E('feature/ranger/expertise'), A({ exp: ['stealth', 'survival'] }));
    const f = c.feats[0];
    expect(f.minLvl).toBe(9);
    const exp = c.grants.filter((g) => g.cat === 'expertise');
    expect(exp).toHaveLength(2);
    for (const g of exp) expect(inactiveReason(c, g)).toBe('from level 9');
    for (const g of exp) expect(isActive({ ...c, level: 9 }, g)).toBe(true);
  });

  it('keeps picks no grant uses and free-text notes', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('background/soldier'), A({ abil: ['o1', 'o1', 'o3'], tool: ['Dice'] }));
    const bg = c.feats.find((f) => f.g === 'background')!;
    expect(c.grants).toContainEqual(expect.objectContaining({ kind: 'prof', cat: 'tool', target: 'Dice', from: 'feature:' + bg.id }));
    expect(c.feats.find((f) => f.cid === 'feat/savage-attacker')).toMatchObject({ from: 'feature:' + bg.id });
    const m = addFromCatalog(blankCharacter(), cat, E('feature/sorcerer/metamagic'), A({ meta: ['Quickened Spell', 'Twinned Spell'] }));
    expect(m.feats[0].desc.endsWith('Metamagic options: Quickened Spell, Twinned Spell')).toBe(true);
  });

  it('names a typed spell after the text, at the pool’s level', () => {
    const e: FeatureEntry = { id: 'feature/test/moon', kind: 'feature', name: 'Moon', src: 'srd', desc: 'Invented.', cls: 'test', lvl: 1,
      grants: [{ kind: 'choice', id: 'sp', name: 'Spell', pick: 1, pool: 'spell:list=nope;lvl=1' }, { id: 'g1', kind: 'spell', name: 'Moon spell', spell: '$sp' }] };
    const c = addFromCatalog(blankCharacter(), cat, e, A({ sp: ['Moonbeam Arrow'] }));
    expect(c.spells[0]).toMatchObject({ name: 'Moonbeam Arrow', lvl: 1 });
  });

  it('adds what it can when a pool offers nothing', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/expertise'), A());
    expect(c.feats).toHaveLength(1);
    expect(c.grants).toEqual([]);
    const d = addFromCatalog(blankCharacter(), cat, E('feature/ranger/deft-explorer'), A({ lang: ['Elvish', 'Dwarvish'] }));
    expect(d.grants.map((g) => [g.cat, g.target])).toEqual([['language', 'Elvish'], ['language', 'Dwarvish']]);
    expect(JSON.stringify(d.grants)).not.toContain('$');
  });

  const goliathAns = A({}, { 'trait/goliath/giant-ancestry': A({ anc: ['trait/goliath/stones-endurance-stone-giant'] }) });
  it('copies a new species’ Speed and size onto the sheet, never over a species already typed', () => {
    const blank = blankCharacter();
    const g = addFromCatalog(blank, cat, E('species/goliath'), goliathAns);
    expect([g.speedBase, g.size, g.ch.species]).toEqual([35, 'medium', 'Goliath']);
    const gnome = addFromCatalog(blank, cat, E('species/gnome'),
      A({}, { 'trait/gnome/gnomish-lineage': A({ lin: ['trait/gnome/rock-gnome'] }, { 'trait/gnome/rock-gnome': A({ ab: ['int'] }) }) }));
    expect(gnome.size).toBe('small');
    const human = addFromCatalog(blank, cat, E('species/human'),
      A({}, { 'trait/human/skillful': A({ c1: ['stealth'] }), 'trait/human/versatile': A({ c1: ['feat/alert'] }) }));
    expect(human.size).toBe('medium');
    const hf = human.feats.find((f) => f.g === 'species' && f.cid === 'species/human')!;
    expect(hf.desc.endsWith('Size: Small or Medium (set it in Edit details)')).toBe(true);
    expect(human.feats.some((f) => f.cid === 'feat/alert')).toBe(true);
    const typed = { ...blank, ch: { ...blank.ch, species: 'Wood Elf' }, speedBase: 30, size: 'small' as const };
    const t = addFromCatalog(typed, cat, E('species/goliath'), goliathAns);
    expect([t.speedBase, t.size, t.ch.species]).toEqual([30, 'small', 'Wood Elf']);
    expect(() => addFromCatalog(blank, cat, E('species/goliath'), A())).toThrow();
  });

  it('adds the Elf species as one feature with every trait under it, answers following the tree', () => {
    const ans = A({}, {
      'trait/elf/elven-lineage': A({ lin: ['trait/elf/wood-elf'] }, { 'trait/elf/wood-elf': A({ ab: ['wis'] }) }),
      'trait/elf/keen-senses': A({ c1: ['o2'] })
    });
    const c = addFromCatalog(blankCharacter(), cat, E('species/elf'), ans);
    expect(c.ch.species).toBe('Elf');
    const elf = c.feats.find((f) => f.cid === 'species/elf')!;
    expect(elf.g).toBe('species');
    const traits = c.feats.filter((f) => f.from === 'feature:' + elf.id);
    expect(traits.map((f) => f.cid).sort()).toEqual(['trait/elf/darkvision', 'trait/elf/elven-lineage', 'trait/elf/fey-ancestry', 'trait/elf/keen-senses', 'trait/elf/trance']);
    const lineage = c.feats.find((f) => f.cid === 'trait/elf/elven-lineage')!;
    const wood = c.feats.find((f) => f.cid === 'trait/elf/wood-elf')!;
    expect(wood.from).toBe('feature:' + lineage.id);
    expect(c.senses.map((x) => x.name)).toEqual(['Darkvision']);
    expect(c.defenses.map((x) => x.name)).toEqual(['vs Charmed']);
    expect(c.grants).toContainEqual(expect.objectContaining({ kind: 'prof', target: 'perception' }));
    const dc = c.spells.find((x) => x.cid === 'spell/druidcraft')!;
    expect(dc.castAb).toBe('wis');
    const ls = c.spells.find((x) => x.cid === 'spell/longstrider')!, pwt = c.spells.find((x) => x.cid === 'spell/pass-without-trace')!;
    expect([ls.minLvl, ls.lvl, pwt.minLvl, pwt.lvl]).toEqual([3, 1, 5, 2]);
    expect(isActive(c, ls)).toBe(false);
    const kept = addFromCatalog({ ...blankCharacter(), ch: { ...blankCharacter().ch, species: 'Wood Elf' } }, cat, E('species/elf'), ans);
    expect(kept.ch.species).toBe('Wood Elf');
    const gone = removeFeature(c, elf.id);
    expect([gone.feats, gone.spells, gone.senses, gone.defenses, gone.grants, gone.res]).toEqual([[], [], [], [], [], []]);
    const flat = A({}, {
      'trait/elf/elven-lineage': A({ lin: ['trait/elf/wood-elf'] }), 'trait/elf/wood-elf': A({ ab: ['wis'] }), 'trait/elf/keen-senses': A({ c1: ['o2'] })
    });
    expect(() => addFromCatalog(blankCharacter(), cat, E('species/elf'), flat)).toThrow();
  });

  it('adds every Goliath trait, Large Form waiting for level 5, and only the picked ancestry', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('species/goliath'), goliathAns);
    const gol = c.feats.find((f) => f.cid === 'species/goliath')!;
    expect(c.feats.filter((f) => f.from === 'feature:' + gol.id).map((f) => f.name).sort()).toEqual(['Giant Ancestry', 'Large Form', 'Powerful Build']);
    const ancestries = cat.list.filter((e) => e.kind === 'trait' && e.of === 'trait/goliath/giant-ancestry').map((e) => e.id);
    expect(ancestries).toHaveLength(6);
    expect(c.feats.filter((f) => ancestries.includes(f.cid ?? '')).map((f) => f.cid)).toEqual(['trait/goliath/stones-endurance-stone-giant']);
    const lf = c.feats.find((f) => f.name === 'Large Form')!;
    expect(lf.minLvl).toBe(5);
    const lfRes = c.res.find((r) => r.from === 'feature:' + lf.id)!;
    expect(inactiveReason(c, lfRes)).toBe('from level 5');
    expect(isActive({ ...c, level: 5 }, lfRes)).toBe(true);
  });

  it('stores counted and links answers on the grants', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('background/acolyte'),
      A({ abil: ['o1', 'o2', 'o3'] }, { 'feat/magic-initiate': A({ cantrips: ['spell/guidance', 'spell/sacred-flame'], spell1: ['spell/bless'], ab: ['wis'] }) },
        { counted: { o1: true } }));
    expect(c.grants.find((g) => g.ab === 'int')!.counted).toBe(true);
    expect(c.grants.find((g) => g.ab === 'wis')!.counted).toBeUndefined();
    const own: Character = { ...blankCharacter(), res: [{ id: 'r1', name: 'Favored Enemy', count: 2, max: 2, recharge: 'long' }] };
    const fe = addFromCatalog(own, cat, E('feature/ranger/favored-enemy'), A({}, undefined, { links: { g2: 'r1' } }));
    expect(fe.res).toHaveLength(1);
    expect(fe.res[0]).toMatchObject({ id: 'r1', from: 'feature:' + fe.feats[0].id, linked: true });
  });

  it('adds a pack entry the same way', () => {
    const fake: Entry = { id: 'feat/fake-feat', kind: 'feat', name: 'Fake Feat', src: 'phb', desc: 'Invented text.', cat: 'origin',
      grants: [{ id: 'g1', kind: 'init', name: 'Initiative +1', val: '1' }] };
    const merged = mergeCatalog(srdEntries, [fake]);
    const c = addFromCatalog(blankCharacter(), merged, merged.byId.get('feat/fake-feat')!, A());
    expect(c.feats[0]).toMatchObject({ name: 'Fake Feat', g: 'feat', cid: 'feat/fake-feat', desc: 'Invented text.' });
    expect(c.grants).toEqual([expect.objectContaining({ kind: 'init', val: '1', from: 'feature:' + c.feats[0].id })]);
  });
});

// ---- Task 5: class and subclass ids ----
describe('matching names to catalog ids', () => {
  const srdOnly = cat;
  const withCh = (ch: Partial<Character['ch']>): Character => ({ ...blankCharacter(), ch: { ...blankCharacter().ch, ...ch } });
  it('matches a class, species or subclass by name', () => {
    expect(matchId(cat, 'class', ' ranger ')).toBe('class/ranger');
    expect(matchId(cat, 'species', 'Wood Elf')).toBe('species/elf');
    expect(matchId(cat, 'species', 'Elf')).toBe('species/elf');
    expect(matchId(srdOnly, 'species', 'Aasimar')).toBe('');
    expect(matchId(cat, 'subclass', 'Hunter', 'class/ranger')).toBe('subclass/ranger/hunter');
    expect(matchId(cat, 'subclass', 'Hunter', 'class/druid')).toBe('');
  });
  it('finds the class and subclass of an old save by name', () => {
    expect(classIdOf(cat, withCh({ cls: 'Ranger' }))).toBe('class/ranger');
    expect(subclassIdOf(cat, withCh({ cls: 'Ranger', sub: 'Hunter' }))).toBe('subclass/ranger/hunter');
    expect(classIdOf(cat, withCh({ cls: 'Ranger', clsId: 'class/nope' }))).toBe('class/ranger');
    expect(classIdOf(cat, withCh({ cls: 'Whatever', clsId: 'class/druid' }))).toBe('class/druid');
    expect(subclassIdOf(cat, withCh({ cls: 'Druid', clsId: 'class/druid', sub: 'Circle of the Stars', subId: 'subclass/druid/circle-of-the-stars' }))).toBe('');
  });
  it('fills the subclass name and id from a subclass choice, never over a typed one', () => {
    const c = addFromCatalog(withCh({ cls: 'Ranger' }), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    expect([c.ch.sub, c.ch.subId]).toEqual(['Hunter', 'subclass/ranger/hunter']);
    const typed = addFromCatalog(withCh({ cls: 'Ranger', sub: 'Gloom Stalker', subId: '' }), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    expect([typed.ch.sub, typed.ch.subId]).toEqual(['Gloom Stalker', '']);
  });
  it('names a spell’s class source through the class id', () => {
    const c = addFromCatalog(withCh({ cls: '', clsId: 'class/wizard' }), cat, E('spell/fireball'), A());
    expect(c.spells[0]).toMatchObject({ srcKind: 'class', srcName: 'Wizard' });
  });
});

// ---- Task 6: the custom spell form ----
describe('spellFromForm', () => {
  const sd = (p: Partial<SpellDraft>): SpellDraft => ({ ...BLANK_SPELL, ...p });
  const fb = spell('spell/fire-bolt');
  it('a typed Fire Bolt equals the catalog one, minus the catalog-only fields', () => {
    const d = sd({ name: 'Fire Bolt', lvl: '0', time: 'Action', range: '120 feet', dur: 'Instantaneous', comp: 'V, S', desc: fb.desc, atk: 'ranged',
      fx: 'damage', dmg: '1d10', dtype: 'Fire', dice: '1d10 Fire · ranged attack' });
    expect(spellFromForm(d)).toEqual(without(spellFromEntry(fb), 'cid', 'school', 'classes', 'scale', 'ritual', 'prep'));
    expect('prep' in spellFromForm(d)).toBe(false);
    expect(spellFromForm(sd({ name: 'X', always: false })).always).toBeUndefined();
  });
  it('round-trips catalog spells through the draft', () => {
    for (const id of ['spell/fire-bolt', 'spell/fireball', 'spell/shield-of-faith']) {
      const x = spellFromEntry(spell(id));
      expect([id, spellFromForm(draftFromSpell({ id: 's1', ...x }))]).toEqual([id, without(x, 'prep')]);
    }
    const fireball = { id: 's1', ...spellFromEntry(spell('spell/fireball')) };
    const renamed = spellFromForm({ ...draftFromSpell(fireball), name: 'Big Fireball' });
    expect(renamed).toMatchObject({ name: 'Big Fireball', cid: 'spell/fireball', school: 'Evocation', classes: fireball.classes, scale: fireball.scale, ritual: false });
  });
  it('edits clear what the form cleared and keep what it doesn’t own', () => {
    const fireball: Spell = { id: 's1', ...spellFromEntry(spell('spell/fireball')), prep: false };
    const cleared = saveEntry<Spell>([fireball], spellFromForm({ ...draftFromSpell(fireball), desc: '', save: '', dmg: '' }), 's1')[0];
    expect([cleared.desc, cleared.save, cleared.dmg]).toEqual([undefined, undefined, undefined]);
    expect(cleared.prep).toBe(false);
    const always: Spell = { id: 's2', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', always: true };
    expect(saveEntry<Spell>([always], spellFromForm({ ...draftFromSpell(always), always: false }), 's2')[0].always).toBeUndefined();
    const hand: Spell = { id: 's3', name: 'Spike Growth', lvl: 2, time: 'Action', range: '150 ft', dice: '2d4 Piercing per 5 ft' };
    expect(saveEntry<Spell>([hand], spellFromForm(draftFromSpell(hand)), 's3')[0].dice).toBe('2d4 Piercing per 5 ft');
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

describe('grantSpellName', () => {
  it('names a granted spell after the catalog spell or the typed text, never the spec label', () => {
    expect(grantSpellName(cat, { name: 'Cantrips', spell: 'spell/guidance' })).toBe('Guidance');
    expect(grantSpellName(cat, { name: 'Cantrips', spell: 'Moonbeam Arrow' })).toBe('Moonbeam Arrow');
    expect(grantSpellName(cat, { name: 'Cantrips', spell: 'spell/not-loaded' })).toBe('Cantrips');
  });
});

// ---- Task 7: the custom item form ----
describe('draftFromItem', () => {
  const round = (x: Omit<Item, 'id'>) => itemFromForm(draftFromItem({ id: 'i1', ...x }));
  it('round-trips catalog items and keeps their catalog-only fields', () => {
    for (const id of ['item/longsword', 'item/longbow', 'item/dagger', 'item/shield', 'item/bag-of-holding', 'item/wand-of-magic-missiles', 'item/dagger-of-venom']) {
      const x = itemFromEntry(item(id));
      expect([id, round(x)]).toEqual([id, without(x, 'eq')]);
    }
    expect(draftFromItem({ id: 'i1', ...itemFromEntry(item('item/dagger-of-venom')) })).toMatchObject({ kind: 'weapon', cat: 'magic', base: 'item/dagger' });
    expect(draftFromItem({ id: 'i1', ...itemFromEntry(item('item/bag-of-holding')) }).kind).toBe('container');
    expect(draftFromItem({ id: 'i1', ...itemFromEntry(item('item/shield')) }).kind).toBe('armor');
  });
  it('round-trips custom armor and a formula charges maximum', () => {
    const mail = itemFromForm({ ...BLANK_ITEM, kind: 'armor', cat: 'armor', name: 'Chain Mail +1', armor: 'heavy', acBase: '16', acBonus: '1' });
    expect(mail).toMatchObject({ armor: 'heavy', acBase: 16, acBonus: 1 });
    expect(round({ ...mail, eq: false })).toEqual(mail);
    const rod: Omit<Item, 'id'> = { name: 'Rod', qty: 1, eq: false, cat: 'gear', count: 2, maxV: 'pb', recharge: 'long' };
    expect(draftFromItem({ id: 'i1', ...rod })).toMatchObject({ charges: true, chMaxKind: 'formula', chMaxText: 'pb' });
    expect(round(rod)).toEqual(without(rod, 'eq'));
  });
  it('keeps the catalog fields and the charges left through an edit', () => {
    const bag: Item = { id: 'i1', ...itemFromEntry(item('item/bag-of-holding')) };
    const renamed = saveEntry<Item>([bag], itemFromForm({ ...draftFromItem(bag), name: 'My Bag' }), 'i1')[0];
    expect(renamed).toMatchObject({ name: 'My Bag', cid: 'item/bag-of-holding', cost: bag.cost, rarity: 'Uncommon', cat: 'magic' });
    const wand: Item = { id: 'i2', ...itemFromEntry(item('item/wand-of-magic-missiles')), count: 3 };
    expect(saveEntry<Item>([wand], itemFromForm(draftFromItem(wand)), 'i2')[0].count).toBe(3);
  });
  it('lets the player set the base of armor of their choice', () => {
    const plus = { id: 'i1', ...itemFromEntry(item('item/armor-1-2-or-3')) };
    const d = draftFromItem(plus);
    expect([d.kind, d.cat]).toEqual(['none', 'magic']);
    const set = itemFromForm({ ...d, kind: 'armor', armor: 'medium', acBase: '14', acBonus: '1', cat: catForKind('armor', 'medium') });
    expect(set).toMatchObject({ armor: 'medium', acBase: 14, acBonus: 1, cat: 'armor', cid: 'item/armor-1-2-or-3', rarity: plus.rarity, desc: plus.desc });
  });
});

describe('withDetectedArmor', () => {
  it('fills a new item named like armor', () => {
    const d = withDetectedArmor({ ...BLANK_ITEM, name: 'Chain Mail' });
    expect(d).toMatchObject({ kind: 'armor', armor: 'heavy', cat: 'armor' });
    const it = itemFromForm(d);
    expect(it).toMatchObject({ armor: 'heavy', acBase: 16, cat: 'armor' });
    expect(draftFromItem({ id: 'i1', ...it, eq: false }).kind).toBe('armor');
    expect(withDetectedArmor({ ...BLANK_ITEM, name: '+1 Shield' })).toMatchObject({ kind: 'armor', armor: 'shield', acBonus: '1', cat: 'shield' });
    expect(withDetectedArmor({ ...BLANK_ITEM, name: 'Rope' }).kind).toBe('none');
  });
});

// ---- Task 8: feature candidates ----
describe('featureCandidates', () => {
  const r5 = (over: Partial<Character['ch']> = {}): Character => ({ ...blankCharacter(), level: 5, ch: { ...blankCharacter().ch, cls: 'Ranger', clsId: 'class/ranger', ...over } });
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
    expect(find(featureCandidates(cat, { ...r5(), level: 3 }, 'feat', 'general'), 'feat/ability-score-improvement')).toMatchObject({ ok: false, note: 'Level 4 or higher' });
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

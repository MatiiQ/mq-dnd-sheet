import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { blankCharacter } from '../defaults';
import { migrate } from '../logic';
import { saveEntry } from '../sheet';
import type { Item, Spell } from '../types';
import { mergeCatalog } from './merge';
import type { Entry, ItemEntry, SpellEntry } from './schema';
import { BLANK_ITEM, catForKind, itemFromEntry, itemFromForm, spellFromEntry, spellSummary, type ItemDraft } from './copy';

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

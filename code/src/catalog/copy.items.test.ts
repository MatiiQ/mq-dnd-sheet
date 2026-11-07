import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { blankCharacter } from '../defaults';
import { migrate } from '../migrate';
import { saveEntry } from '../sheet';
import type { Item, Spell } from '../types';
import { mergeCatalog } from './merge';
import { flowNodes, flowReview } from './flow';
import type { Entry, ItemEntry, SpellEntry } from './schema';
import { BLANK_ITEM, BLANK_SPELL, keepPrep, addFromCatalog, armorBaseMissing, draftFromItem, grantSpellName, withDetectedArmor, catForKind, draftFromSpell, spellFromForm, type SpellDraft, type AddChoices, itemFromEntry, itemFromForm, spellFromEntry, spellSummary, itemQuestions, itemStats, answeredName, hasSenseRule, senseRule, weaponRules, type ItemAnswers, type ItemDraft } from './copy';

const cat = mergeCatalog(srdEntries, null);
const get = <T extends Entry>(id: string) => { const e = cat.byId.get(id); if (!e) throw new Error('no ' + id); return e as T; };
const spell = (id: string) => get<SpellEntry>(id);
const item = (id: string) => get<ItemEntry>(id);
const without = <T extends object>(x: T, ...keys: string[]) => Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k)));
const draft = (p: Partial<ItemDraft>): ItemDraft => ({ ...BLANK_ITEM, ...p });
const A = (picks: Record<string, string[]> = {}, nested?: Record<string, AddChoices>, more: Partial<AddChoices> = {}): AddChoices =>
  ({ picks, counted: {}, links: {}, ...(nested ? { nested } : {}), ...more });

describe('spellFromEntry', () => {
  it('copies Fireball with its mechanics and a summary', () => {
    const sp = spellFromEntry(spell('spell/fireball'));
    expect(sp).toMatchObject({ name: 'Fireball', lvl: 3, time: 'Action', range: '150 feet', save: 'dex', fx: 'damage', dmg: '8d6', dtype: 'Fire',
      cid: 'spell/fireball', school: 'Evocation', c: false, ritual: false, prep: true, dice: '8d6 Fire · DEX save' });
    expect(sp.desc).toBe(spell('spell/fireball').desc);
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
  it('adds each part after "; " as "<label>: <summary>"', () => {
    const base = spell('spell/fire-bolt');
    const knife = { ...base, dice: '1d10', dtype: 'Piercing', parts: [{ label: 'Burst', fx: 'damage' as const, dice: '2d6', dtype: 'Cold', save: 'dex' as const }] };
    expect(spellSummary(knife)).toBe('1d10 Piercing · ranged attack; Burst: 2d6 Cold · DEX save');
    const celestial = { ...base, atk: undefined, save: 'dex' as const, dice: '6d12', dtype: 'Radiant', parts: [{ label: 'Healing Light', fx: 'healing' as const, dice: '4d12', healMod: true }] };
    expect(spellSummary(celestial)).toBe('6d12 Radiant · DEX save; Healing Light: 4d12 healing');
  });
  it('writes fixed healing as "heals N HP"', () => {
    expect(spellSummary(spell('spell/heal'))).toBe('heals 70 HP');
    expect(spellSummary(spell('spell/mass-heal'))).toBe('heals 700 HP');
    expect(spellSummary(spell('spell/power-word-heal'))).toBe('heals all HP');
  });
  it('names a chosen damage type as the list of types', () => {
    const base = spell('spell/fire-bolt');
    expect(spellSummary({ ...base, dice: '3d8', dtype: undefined, dtypes: 'Acid,Cold,Fire' })).toBe('3d8 Acid/Cold/Fire · ranged attack');
  });
});

describe('rolled starting charges', () => {
  it('asks for the roll, with its range', () => {
    expect(itemQuestions(cat, item('item/luck-blade')).filter((q) => q.key === 'charges')).toEqual([{ key: 'charges', label: 'Starting charges (roll 1d3)', min: 1, max: 3 }]);
    expect(itemQuestions(cat, item('item/nine-lives-stealer')).find((q) => q.key === 'charges')).toMatchObject({ min: 2, max: 9 });
    expect(itemQuestions(cat, item('item/wand-of-magic-missiles'))).toEqual([]);
  });
  it('sets count and maximum from the answer, and gives no counter without one', () => {
    expect(itemFromEntry(item('item/nine-lives-stealer'), { charges: 5 })).toMatchObject({ count: 5, max: 5, recharge: 'none' });
    const none = itemFromEntry(item('item/nine-lives-stealer'));
    expect([none.count, none.max, none.maxV, none.recharge, none.regain, none.regainOn]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(itemFromEntry(item('item/wand-of-magic-missiles'))).toMatchObject({ count: 7, max: 7, recharge: 'dawn' });
  });
  it('refuses a missing or out-of-range roll before anything changes', () => {
    const blank = blankCharacter(), blade = item('item/nine-lives-stealer');
    expect(() => addFromCatalog(blank, cat, blade, A({}, undefined, { item: { base: 'item/longsword' } }))).toThrow(/charges/i);
    expect(() => addFromCatalog(blank, cat, blade, A({}, undefined, { item: { base: 'item/longsword', charges: 1 } }))).toThrow(/charges/i);
    expect(() => addFromCatalog(blank, cat, blade, A({}, undefined, { item: { base: 'item/longsword', charges: 10 } }))).toThrow(/charges/i);
    expect(() => addFromCatalog(blank, cat, blade, A({}, undefined, { item: { base: 'item/longsword', charges: 2.5 } }))).toThrow(/charges/i);
    expect(addFromCatalog(blank, cat, blade, A({}, undefined, { item: { base: 'item/longsword', charges: 9 } })).inv.at(-1)).toMatchObject({ name: 'Nine Lives Stealer (Longsword)', count: 9, max: 9 });
  });
});

describe('a magic weapon or armor of the player’s choice', () => {
  const blank = blankCharacter();
  const ask = (id: string) => itemQuestions(cat, item(id));
  const added = (id: string, a: ItemAnswers) => addFromCatalog(blank, cat, item(id), A({}, undefined, { item: a })).inv.at(-1)!;
  it('asks for the base, narrowed by baseOf, then the bonus, then rolled charges', () => {
    expect(ask('item/holy-avenger').map((q) => q.key)).toEqual(['base']);
    expect(ask('item/holy-avenger')[0]).toMatchObject({ label: 'Which weapon?' });
    expect(ask('item/holy-avenger')[0].options!.map((o) => o.value)).toContain('item/longsword');
    expect(ask('item/holy-avenger')[0].options!.every((o) => (cat.byId.get(o.value) as ItemEntry).cat === 'weapon')).toBe(true);
    expect(ask('item/hammer-of-thunderbolts')[0].options!.map((o) => o.label)).toEqual(['Maul', 'Warhammer']);
    expect(ask('item/armor-1-2-or-3').map((q) => [q.key, q.label])).toEqual([['base', 'Which armor?'], ['bonus', '+1, +2 or +3']]);
    expect(ask('item/armor-1-2-or-3')[0].options!.map((o) => o.value)).not.toContain('item/shield');
    expect(ask('item/shield-1-2-or-3').map((q) => q.key)).toEqual(['bonus']);
    expect(ask('item/luck-blade').map((q) => q.key)).toEqual(['base', 'charges']);
  });
  it('copies the chosen base’s fields, sets base and names the item after the answers', () => {
    const avenger = added('item/holy-avenger', { base: 'item/longsword' });
    expect(avenger).toMatchObject({ name: 'Holy Avenger (Longsword)', rarity: 'Legendary', base: 'item/longsword', dmg: '1d8', vers: '1d10', mastery: 'sap', magic: 3 });
    expect(added('item/weapon-1-2-or-3', { base: 'item/longsword', bonus: 2 })).toMatchObject({ name: 'Longsword +2', rarity: 'Rare', magic: 2, dmg: '1d8' });
    expect(added('item/armor-1-2-or-3', { base: 'item/plate-armor', bonus: 1 })).toMatchObject({ name: 'Plate Armor +1', rarity: 'Rare', armor: 'heavy', acBase: 18, acBonus: 1 });
    expect(added('item/shield-1-2-or-3', { bonus: 3 })).toMatchObject({ name: 'Shield +3', rarity: 'Very Rare', armor: 'shield', acBonus: 3 });
    expect(added('item/wand-of-the-war-mage-1-2-or-3', { bonus: 2 })).toMatchObject({ name: 'Wand of the War Mage +2', rarity: 'Rare', magic: 2 });
    const mithral = added('item/mithral-armor', { base: 'item/half-plate-armor' });
    expect(mithral).toMatchObject({ name: 'Mithral Armor (Half Plate Armor)', armor: 'medium' });
    expect([mithral.strReq, mithral.stealthDis]).toEqual([undefined, undefined]);
    expect(itemFromEntry(item('item/rope')).name).toBe('Rope');
    expect(answeredName(item('item/weapon-1-2-or-3'), item('item/longsword'), 2)).toEqual({ name: 'Longsword +2', rarity: 'Rare' });
  });
  it('asks Ammunition +N for its ammunition, then its bonus, and copies no fields (Task 9b)', () => {
    expect(ask('item/ammunition-1-2-or-3').map((q) => [q.key, q.label])).toEqual([['base', 'Which ammunition?'], ['bonus', '+1, +2 or +3']]);
    expect(ask('item/ammunition-1-2-or-3')[0].options!.map((o) => o.value)).toEqual(['item/arrows', 'item/bolts', 'item/firearm-bullets', 'item/needles', 'item/sling-bullets']);
    expect(added('item/ammunition-1-2-or-3', { base: 'item/arrows', bonus: 1 })).toMatchObject({ name: 'Arrows +1', base: 'item/arrows', magic: 1, rarity: 'Uncommon' });
    expect(() => added('item/ammunition-1-2-or-3', { base: 'item/longbow', bonus: 1 })).toThrow(/ammunition/i);
  });
  it('refuses a missing, foreign or magic base and a bonus outside 1–3 before anything changes', () => {
    expect(() => addFromCatalog(blank, cat, item('item/holy-avenger'), A())).toThrow(/weapon/i);
    expect(() => added('item/hammer-of-thunderbolts', { base: 'item/longsword' })).toThrow(/weapon/i);
    expect(() => added('item/holy-avenger', { base: 'item/sun-blade' })).toThrow(/weapon/i);
    expect(() => added('item/holy-avenger', { base: 'item/plate-armor' })).toThrow(/weapon/i);
    expect(() => added('item/armor-1-2-or-3', { base: 'item/shield', bonus: 1 })).toThrow(/armor/i);
    expect(() => added('item/shield-1-2-or-3', {})).toThrow(/\+1/);
    expect(() => added('item/shield-1-2-or-3', { bonus: 4 as 1 })).toThrow(/\+1/);
  });
});

describe('itemStats', () => {
  it('builds a line from a weapon’s or armor’s fields, for one without a description', () => {
    expect(itemStats(item('item/longsword'))).toBe('Martial melee weapon · 1d8 Slashing · Versatile (1d10) · Mastery: Sap');
    expect(itemStats(item('item/longbow'))).toBe('Martial ranged weapon · 1d8 Piercing · Ammunition (150/600, Arrow), Heavy, Two-Handed · Mastery: Slow');
    expect(itemStats(item('item/dagger'))).toBe('Simple melee weapon · 1d4 Piercing · Finesse, Light, Thrown (20/60) · Mastery: Nick');
    expect(itemStats(item('item/plate-armor'))).toBe('Heavy armor · AC 18 · Strength 15 · Stealth Disadvantage');
    expect(itemStats(item('item/leather-armor'))).toBe('Light armor · AC 11 + Dex');
    expect(itemStats(item('item/breastplate'))).toBe('Medium armor · AC 14 + Dex (max 2)');
    expect(itemStats(item('item/shield'))).toBe('Shield · +2 AC');
    expect(itemStats(item('item/rope'))).toBe('');
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
  it('reads a formula charges maximum as maxV, with no charges yet', () => {
    const e: ItemEntry = { id: 'item/test-rod', kind: 'item', name: 'Test Rod', src: 'srd', desc: 'Invented.', cat: 'magic', charges: 'pb', recharge: 'long' };
    const it = itemFromEntry(e);
    expect(it).toMatchObject({ maxV: 'pb', count: 0 });
    expect(it.max).toBeUndefined();
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
  it('keeps the ammunition type without a range, and the range without a type', () => {
    const bow = draft({ kind: 'weapon', cat: 'weapon', name: 'Longbow', dmg: '1d8', props: ['ammunition'], ammoRange: '', ammoType: 'Arrow' });
    expect(itemFromForm(bow).ammo).toBe(';arrow');
    expect(draftFromItem({ id: 'b', eq: false, ...itemFromForm(bow) })).toMatchObject({ ammoRange: '', ammoType: 'arrow' });
    expect(itemFromForm({ ...bow, ammoRange: '150/600', ammoType: '' }).ammo).toBe('150/600;');
    expect(itemFromForm({ ...bow, ammoType: '' }).ammo).toBeUndefined();
  });
  it('a custom Dagger writes its thrown range', () => {
    const d = draft({ kind: 'weapon', cat: 'weapon', name: 'Dagger', wt: '1', wcat: 'simple', wrange: 'melee', dmg: '1d4', dtype: 'Piercing',
      props: ['finesse', 'light', 'thrown'], thrownRange: '20/60', mastery: 'nick' });
    expect(itemFromForm(d)).toEqual(without(itemFromEntry(item('item/dagger')), 'cid', 'cost', 'eq'));
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
    expect(spellFromEntry(spell('spell/cure-wounds')).healMod).toBe(true);
    for (const id of ['spell/fire-bolt', 'spell/fireball', 'spell/shield-of-faith', 'spell/cure-wounds']) {
      const x = spellFromEntry(spell(id));
      expect([id, spellFromForm(draftFromSpell({ id: 's1', ...x }))]).toEqual([id, without(x, 'prep')]);
    }
    const fireball = { id: 's1', ...spellFromEntry(spell('spell/fireball')) };
    const renamed = spellFromForm({ ...draftFromSpell(fireball), name: 'Big Fireball' });
    expect(renamed).toMatchObject({ name: 'Big Fireball', cid: 'spell/fireball', school: 'Evocation', classes: fireball.classes, scale: fireball.scale, ritual: false });
  });
  it('copies dmgMod and dtypes, keeps them through an edit, and lets a typed damage type win over dtypes', () => {
    const orb = { ...spell('spell/fire-bolt'), dice: '3d8', dtype: undefined, dtypes: 'Acid,Cold,Fire', dmgMod: true as const };
    const x = { id: 's1', ...spellFromEntry(orb) };
    expect([x.dtypes, x.dmgMod, x.dtype]).toEqual(['Acid,Cold,Fire', true, undefined]);
    expect(spellFromForm(draftFromSpell(x))).toEqual(without(x, 'id', 'prep'));
    const typed = spellFromForm({ ...draftFromSpell(x), dtype: 'Fire' });
    expect([typed.dtype, typed.dtypes]).toEqual(['Fire', undefined]);
    expect(saveEntry<Spell>([x], typed, 's1')[0]).toMatchObject({ dtype: 'Fire', dmgMod: true });
    expect('dtypes' in saveEntry<Spell>([x], typed, 's1')[0] && saveEntry<Spell>([x], typed, 's1')[0].dtypes !== undefined).toBe(false);
  });
  it('copies parts and keeps them through an edit that changes fx or dice', () => {
    const knife = { ...spell('spell/fire-bolt'), parts: [{ label: 'Burst', fx: 'damage' as const, dice: '2d6', dtype: 'Cold', save: 'dex' as const }] };
    const x = { id: 's1', ...spellFromEntry(knife) };
    expect(x.parts).toEqual(knife.parts);
    expect(x.parts).not.toBe(knife.parts);
    expect(spellFromForm(draftFromSpell(x))).toEqual(without(x, 'id', 'prep'));
    const edited = saveEntry<Spell>([x], spellFromForm({ ...draftFromSpell(x), fx: 'healing', dmg: '1d4' }), 's1')[0];
    expect(edited.parts).toEqual(knife.parts);
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

// ---- Task 7: the custom item form ----
describe('draftFromItem', () => {
  const round = (x: Omit<Item, 'id'>) => itemFromForm(draftFromItem({ id: 'i1', ...x }));
  it('keeps a non-weapon’s magic through an edit (Wand of the War Mage +2)', () => {
    const wand: Item = { ...addFromCatalog(blankCharacter(), cat, item('item/wand-of-the-war-mage-1-2-or-3'), A({}, undefined, { item: { bonus: 2 } })).inv.at(-1)!, id: 'w1' };
    expect(wand.magic).toBe(2);
    expect(saveEntry<Item>([wand], itemFromForm(draftFromItem(wand)), 'w1')[0].magic).toBe(2);
    expect(saveEntry<Item>([wand], itemFromForm({ ...draftFromItem(wand), name: 'My Wand' }), 'w1')[0]).toMatchObject({ name: 'My Wand', magic: 2 });
  });
  it('round-trips catalog items and keeps their catalog-only fields', () => {
    for (const id of ['item/longsword', 'item/longbow', 'item/dagger', 'item/shield', 'item/bag-of-holding', 'item/wand-of-magic-missiles', 'item/dagger-of-venom', 'item/chest', 'item/quiver']) {
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

describe('armor base AC in the custom item form', () => {
  const armorDraft = (p: Partial<ItemDraft>): ItemDraft => ({ ...BLANK_ITEM, kind: 'armor', name: 'X', ...p });
  it('gives a Shield left blank its usual +2 (PHB p.219)', () => {
    expect(itemFromForm(armorDraft({ armor: 'shield' })).acBase).toBe(2);
    expect(itemFromForm(armorDraft({ armor: 'shield', acBase: '3' })).acBase).toBe(3);
  });
  it('flags armor without a numeric base', () => {
    expect(armorBaseMissing(armorDraft({ armor: 'heavy' }))).toBe(true);
    expect(armorBaseMissing(armorDraft({ armor: 'heavy', acBase: 'abc' }))).toBe(true);
    expect(armorBaseMissing(armorDraft({ armor: 'heavy', acBase: '18' }))).toBe(false);
    expect(armorBaseMissing(armorDraft({ armor: 'shield' }))).toBe(false);
    expect(armorBaseMissing({ ...BLANK_ITEM, name: 'Rope' })).toBe(false);
  });
});

describe('form details', () => {
  const sp: Spell = { id: 's', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', always: true };
  it('keeps a spell unprepared after unticking Always prepared', () => {
    const edited: Spell = { ...sp, always: undefined, ...keepPrep(sp, false) };
    expect(edited.prep).toBe(false);
    expect(migrate(JSON.parse(JSON.stringify({ ...blankCharacter(), spells: [edited] }))).spells[0].prep).toBe(false);
    expect(keepPrep({ ...sp, prep: true }, false)).toEqual({ prep: true });
    expect(keepPrep(sp, true)).toEqual({});
  });
  it('reads a decimal comma in Holds', () => {
    expect(itemFromForm({ ...BLANK_ITEM, name: 'Bag', kind: 'container', cap: '1,5' }).cap).toBe(1.5);
  });
});

describe('grantSpellName', () => {
  it('names a granted spell after the catalog spell or the typed text, never the spec label', () => {
    expect(grantSpellName(cat, { name: 'Cantrips', spell: 'spell/guidance' })).toBe('Guidance');
    expect(grantSpellName(cat, { name: 'Cantrips', spell: 'Moonbeam Arrow' })).toBe('Moonbeam Arrow');
    expect(grantSpellName(cat, { name: 'Cantrips', spell: 'spell/not-loaded' })).toBe('Cantrips');
  });
});

describe('weaponRules', () => {
  it('finds the rule text of a weapon’s properties and mastery', () => {
    expect(weaponRules(cat, 'finesse,two-handed', 'nick').map((e) => e.name)).toEqual(['Finesse', 'Two-Handed', 'Nick']);
    expect(weaponRules(cat, 'silvered', 'Whirl').map((e) => e.name)).toEqual([]);
    expect(weaponRules(cat, undefined, undefined)).toEqual([]);
  });
});

describe('senseRule', () => {
  it('finds a sense’s rule whatever its case, and none for a typed sense', () => {
    expect(senseRule(cat, ' darkvision ')?.id).toBe('rule/darkvision');
    expect(senseRule(cat, 'Keen Hearing')).toBeUndefined();
    expect([hasSenseRule('Truesight'), hasSenseRule('Keen Hearing')]).toEqual([true, false]);
  });
});

describe('an item’s spell', () => {
  const wand = { id: 'item/test-wand', kind: 'item', name: 'Test Wand', src: 'srd', desc: '', cat: 'wand',
    grants: [{ id: 'g1', kind: 'spell', name: 'Fireball', spell: 'spell/fireball', always: true, dc: '15', atkB: '7' }] } as unknown as ItemEntry;
  const wcat = mergeCatalog([...srdEntries, wand], null);
  it('copies a fixed save DC and attack bonus as numbers', () => {
    const c = addFromCatalog(blankCharacter(), wcat, wand, A());
    expect(c.spells.find((s) => s.cid === 'spell/fireball')).toMatchObject({ dc: 15, atkB: 7, always: true });
  });
  it('keeps them through an edit in the spell form', () => {
    const c = addFromCatalog(blankCharacter(), wcat, wand, A());
    const row = c.spells.find((s) => s.cid === 'spell/fireball')!;
    const edited = saveEntry<Spell>(c.spells, spellFromForm({ ...draftFromSpell(row), name: 'Wand Fireball' }), row.id).find((s) => s.id === row.id)!;
    expect(edited).toMatchObject({ name: 'Wand Fireball', dc: 15, atkB: 7 });
  });
  it('never links to a spell row already there: two rows, the player’s own untouched', () => {
    const own: Spell = { id: 'mine', ...spellFromEntry(spell('spell/fireball')), prep: true };
    const c0 = { ...blankCharacter(), spells: [own] };
    const ans = { '': { picks: {}, counted: {}, links: {} } };
    expect(flowReview(wcat, c0, flowNodes(wcat, c0, wand, ans), ans).links).toEqual([]);
    const c = addFromCatalog(c0, wcat, wand, A());
    expect(c.spells.filter((s) => s.cid === 'spell/fireball')).toHaveLength(2);
    expect(c.spells.find((s) => s.id === 'mine')!.from).toBeUndefined();
  });
});

describe('Spell Scroll', () => {
  it('asks for the spell and adds it as an always-prepared row from the scroll', () => {
    const c = addFromCatalog(blankCharacter(), cat, item('item/spell-scroll'), A({ c1: ['spell/fireball'] }));
    const scroll = c.inv.find((i) => i.cid === 'item/spell-scroll')!;
    expect(c.spells.find((s) => s.cid === 'spell/fireball')).toMatchObject({ always: true, from: 'item:' + scroll.id });
  });
});

describe('items that cast spells (catalog data)', () => {
  it('gives the Wand of Fireballs its spell with charges and DC', () => {
    const c = addFromCatalog(blankCharacter(), cat, item('item/wand-of-fireballs'), A());
    expect(c.spells.find((s) => s.cid === 'spell/fireball')).toMatchObject({ dc: 15, chg: 1, chgMax: 3, always: true, needEq: true, needAtt: true });
  });
  it('gives a once-per-dawn item spell a free cast of its row', () => {
    const c = addFromCatalog(blankCharacter(), cat, item('item/cape-of-the-mountebank'), A());
    const row = c.spells.find((s) => s.cid === 'spell/dimension-door')!;
    expect(c.res.find((r) => r.casts === row.id)).toMatchObject({ max: 1, recharge: 'dawn' });
  });
});

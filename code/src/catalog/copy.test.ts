import { describe, expect, it } from 'vitest';
import { withClass, withClasses } from '../test-fixtures';
import srdEntries from '../data/srd/index';
import { blankCharacter, sampleCharacter } from '../defaults';
import { removeRef, armorClass, skillLevel, spellUsable } from '../logic';
import { migrate } from '../migrate';
import { inactiveReason, isActive } from '../links';
import { saveEntry } from '../sheet';
import type { Character, ClassRow, Item, Spell } from '../types';
import { entriesOf, mergeCatalog } from './merge';
import type { Entry, FeatureEntry, ItemEntry, SpellEntry } from './schema';
import {
  keepPrep, atLevel, choiceActive, featureName,
  addFromCatalog, armorBaseMissing, draftFromItem, featureCandidates, grantSpellName, withDetectedArmor, BLANK_ITEM, BLANK_SPELL, catForKind, countedDefault, draftFromSpell, spellFromForm, type SpellDraft, choicesOf, classIdOf, matchId, nestedEntries, subclassIdOf, type AddChoices, freeText, itemFromEntry, itemFromForm, missingPicks, needed, optionGroups, poolOptions, prereqMet, resolveChoices,
  spellFromEntry, spellSummary, validPicks, itemQuestions, itemStats, answeredName, hasSenseRule, senseRule, weaponRules, type ItemAnswers, type ItemDraft
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
    expect(m.specs).toEqual([]);
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
    expect(c2.res.map((r) => r.name)).toEqual(['Goodberry (free cast)', 'Magic Missile (free cast)']);
  });

  it('adds a background with its origin feat preset, and removing it removes both', () => {
    const blank = blankCharacter();
    expect(nestedEntries(cat, E('background/acolyte'), {})).toEqual([{ entry: E('feat/magic-initiate'), preset: { list: ['cleric'] } }]);
    const mi = A({ cantrips: ['spell/guidance', 'spell/sacred-flame'], spell1: ['spell/bless'], ab: ['wis'] });
    const c = addFromCatalog(blank, cat, E('background/acolyte'), A({ abil: ['o2', 'o2', 'o3'] }, { 'feat/magic-initiate': mi }, { equip: 'none' }));
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
    expect(() => addFromCatalog(blank, cat, E('background/acolyte'), A({ abil: ['o2', 'o2', 'o3'] }, undefined, { equip: 'none' }))).toThrow();
    expect(() => addFromCatalog(blank, cat, E('background/acolyte'), A({}, { 'feat/magic-initiate': mi }, { equip: 'none' }))).toThrow();
    const gone = removeRef(c, { kind: 'feature', id: bg.id });
    expect(gone.feats).toEqual([]);
    expect(gone.spells).toEqual([]);
    expect(gone.grants).toEqual([]);
  });

  it('adds a subclass picked by a choice as its own feature, without its features', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('feature/ranger/ranger-subclass'), A({ sub: ['subclass/ranger/hunter'] }));
    const top = c.feats.find((f) => f.cid === 'feature/ranger/ranger-subclass')!;
    expect(c.feats.find((f) => f.cid === 'subclass/ranger/hunter')).toMatchObject({ g: 'sub', name: 'Hunter', from: 'feature:' + top.id });
    expect(c.feats).toHaveLength(2);
    expect(addFromCatalog(blankCharacter(), cat, E('feature/fighter/champion/improved-critical'), A()).feats[0].g).toBe('sub');
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
    const c = addFromCatalog(withClass({ ...blankCharacter()}, { lvl: 5 }), cat, rod, A());
    expect(c.inv[0]).toMatchObject({ maxV: 'pb', count: 3 });
  });

  it('adds Shillelagh with its own grant, removed with it', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('spell/shillelagh'), A());
    const sp = c.spells[0];
    expect(c.grants).toEqual([expect.objectContaining({ kind: 'atkAbil', from: 'spell:' + sp.id })]);
    expect(removeRef(c, { kind: 'spell', id: sp.id }).grants).toEqual([]);
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
    const after = removeRef(twice, { kind: 'feature', id: feat.id });
    expect(after.spells.map((x) => x.id)).toEqual([pid]);
    expect(after.grants.filter((g) => g.kind === 'atkAbil')).toHaveLength(1);
  });

  it('adds a feature above the character’s level with minLvl, its grants inactive until then', () => {
    const r5 = withClass(withSkills(['stealth', 'survival']), { lvl: 5 });
    const c = addFromCatalog(r5, cat, E('feature/ranger/expertise'), A({ exp: ['stealth', 'survival'] }));
    const f = c.feats[0];
    expect(f.minLvl).toBe(9);
    const exp = c.grants.filter((g) => g.cat === 'expertise');
    expect(exp).toHaveLength(2);
    for (const g of exp) expect(inactiveReason(c, g)).toBe('from level 9');
    for (const g of exp) expect(isActive(withClass({ ...c}, { lvl: 9 }), g)).toBe(true);
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
    const gone = removeRef(c, { kind: 'feature', id: elf.id });
    expect([gone.feats, gone.spells, gone.senses, gone.defenses, gone.grants, gone.res]).toEqual([[], [], [], [], [], []]);
    const flat = A({}, {
      'trait/elf/elven-lineage': A({ lin: ['trait/elf/wood-elf'] }), 'trait/elf/wood-elf': A({ ab: ['wis'] }), 'trait/elf/keen-senses': A({ c1: ['o2'] })
    });
    expect(() => addFromCatalog(blankCharacter(), cat, E('species/elf'), flat)).toThrow();
  });

  it('stores counted and links answers on the grants', () => {
    const c = addFromCatalog(blankCharacter(), cat, E('background/acolyte'),
      A({ abil: ['o1', 'o2', 'o3'] }, { 'feat/magic-initiate': A({ cantrips: ['spell/guidance', 'spell/sacred-flame'], spell1: ['spell/bless'], ab: ['wis'] }) },
        { counted: { o1: true }, equip: 'none' }));
    expect(c.grants.find((g) => g.ab === 'int')!.counted).toBe(true);
    expect(c.grants.find((g) => g.ab === 'wis')!.counted).toBeUndefined();
    const own: Character = { ...blankCharacter(), res: [{ id: 'r1', name: 'Favored Enemy', count: 2, max: 2, recharge: 'long' }] };
    const fe = addFromCatalog(own, cat, E('feature/ranger/favored-enemy'), A({}, undefined, { links: { g2: 'r1' } }));
    expect(fe.res).toHaveLength(1);
    expect(fe.res[0]).toMatchObject({ id: 'r1', from: 'feature:' + fe.feats[0].id, linked: true });
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

describe('effect grants through the add flow', () => {
  const blank = blankCharacter();
  it('adds a chosen weapon’s rider and a potion’s chosen resistance', () => {
    const tongue = addFromCatalog(blank, cat, cat.byId.get('item/flame-tongue')!, { picks: {}, counted: {}, links: {}, nested: {}, item: { base: 'item/longsword' } });
    expect(tongue.grants.find((g) => g.kind === 'xdmg')).toMatchObject({ dice: '2d6', dtype: 'Fire', when: 'active', needEq: true, needAtt: true });
    const potion = addFromCatalog(blank, cat, cat.byId.get('item/potion-of-resistance')!, { picks: { c1: ['o3'] }, counted: {}, links: {}, nested: {} });
    expect(potion.defenses).toMatchObject([{ kind: 'res', name: 'Fire', when: 'active' }]);
  });
  it('adds both of the Air ring’s grants from one pick', () => {
    const c = addFromCatalog(blank, cat, cat.byId.get('item/ring-of-elemental-command')!, { picks: { c1: ['o1'] }, counted: {}, links: {}, nested: {} });
    expect([c.defenses.map((d) => d.name), c.grants.filter((g) => g.kind === 'speed').map((g) => g.mode)]).toEqual([['Lightning'], ['fly']]);
  });
});

describe('granted spells with prepared tracking on', () => {
  it('Mystic Arcanum adds a spell the player can cast with prepared tracking on', () => {
    const c: Character = withClass({ ...blankCharacter(), usePrep: true }, { name: 'Warlock', lvl: 20 });
    const id = poolOptions(cat, c, 'spell:list=warlock;lvl=6|7|8|9', {})[0].value;
    const sheet = addFromCatalog(c, cat, cat.byId.get('feature/warlock/mystic-arcanum')!, { picks: { arc: [id] }, counted: {}, links: {} });
    const sp = sheet.spells.find((x) => x.cid === id)!;
    expect(spellUsable(sheet, sp)).toBe(true);
    expect(sheet.res.find((r) => r.name.includes('free cast'))!.casts).toBe(sp.id);
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

describe('background starting equipment', () => {
  const bg = { id: 'background/test', kind: 'background', name: 'Test', src: 'srd', desc: '', feat: 'feat/alert', equip: 'A: Dagger, Lucky charm, Parchment; B: 50 GP', grants: [],
    equipA: 'item/dagger;Lucky charm;item/parchment*10', gpA: 15, gpB: 50 } as Entry;
  const bcat = mergeCatalog([...srdEntries, bg], null);
  const add = (equip?: 'A' | 'B' | 'none') => addFromCatalog(blankCharacter(), bcat, bg, { picks: {}, counted: {}, links: {}, ...(equip ? { equip } : {}) });
  const gp = blankCharacter().coins.gp;
  it('package A adds its items and coins', () => {
    const c = add('A');
    expect(c.inv.map((i) => [i.name, i.qty, i.cid])).toEqual([['Dagger', 1, 'item/dagger'], ['Lucky charm', 1, undefined], ['Parchment', 10, 'item/parchment']]);
    expect(c.inv.every((i) => !i.eq)).toBe(true);
    expect(c.coins.gp).toBe(gp + 15);
  });
  it('package B adds its coins only', () => {
    const c = add('B');
    expect(c.inv).toEqual([]);
    expect(c.coins.gp).toBe(gp + 50);
  });
  it('none adds neither', () => expect([add('none').inv, add('none').coins.gp]).toEqual([[], gp]));
  it('asks for it', () => expect(() => add()).toThrow('Test: choose starting equipment'));
});

describe('class levels in the catalog flow', () => {
  it('reads a pickAt table at the class level of the entry', () => {
    const mm: FeatureEntry = { id: 'feature/sorcerer/metamagic', kind: 'feature', name: 'Metamagic', src: 'srd', desc: '', cls: 'sorcerer', lvl: 2,
      grants: [{ kind: 'choice', id: 'mm', name: 'Metamagic', pick: 2, pickAt: '2:2,10:4', pool: 'other:any' }] };
    const c = withClasses(blankCharacter(), [{ clsId: 'class/sorcerer', lvl: 3 }, { clsId: 'class/fighter', lvl: 8 }]);
    expect((atLevel(c, mm).grants[0] as { pick: number }).pick).toBe(2);
  });
  it('gates a class feature above the class level, in the add flow and the picker', () => {
    const x: FeatureEntry = { id: 'feature/ranger/zz-test', kind: 'feature', name: 'Zz', src: 'srd', desc: 'Invented.', cls: 'ranger', lvl: 5, grants: [] };
    const local = mergeCatalog([...srdEntries.filter((e) => e.kind === 'class'), x], null);
    const c = withClasses(blankCharacter(), [{ name: 'Ranger', clsId: 'class/ranger', lvl: 3 }, { name: 'Rogue', clsId: 'class/rogue', lvl: 3 }]);
    expect(addFromCatalog(c, local, x, A()).feats.at(-1)!.minLvl).toBe(5);
    expect(featureCandidates(local, c, 'class').find((r) => r.entry.id === x.id)).toMatchObject({ ok: false });
  });
  it('reads an option’s lvl>= prerequisite at its class level', () => {
    const c = withClasses(blankCharacter(), [{ clsId: 'class/warlock', lvl: 2 }, { clsId: 'class/fighter', lvl: 5 }]);
    expect(prereqMet(c, 'lvl>=5', [], 'warlock').ok).toBe(false);
    expect(prereqMet(c, 'lvl>=5').ok).toBe(true);
  });
});

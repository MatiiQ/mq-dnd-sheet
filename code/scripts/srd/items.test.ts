import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capacityOf, copyBase, parseArmor, parseGear, parseMagicItems, parseMounts, parseTools, parseWeapons } from './items.ts';
import { validateEntry } from '../../src/catalog/schema.ts';
import type { ItemEntry } from '../../src/catalog/schema.ts';
import { srdLines } from './text.ts';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const by = <T extends { name: string }>(list: T[], name: string) => list.find((e) => e.name === name);

describe('weapons', () => {
  const list = parseWeapons(fx('weapons-layout.txt'));
  it('reads every row of the table', () => expect(list).toHaveLength(38));
  it('reads category, damage, properties, mastery, weight and cost', () => {
    expect(by(list, 'Club')).toMatchObject({ id: 'item/club', kind: 'item', src: 'srd', cat: 'weapon', wcat: 'simple', wrange: 'melee',
      dmg: '1d4', dtype: 'Bludgeoning', props: 'light', mastery: 'slow', wt: 2, cost: '1 SP' });
    expect(by(list, 'Dagger')).toMatchObject({ props: 'finesse,light,thrown', thrown: '20/60', mastery: 'nick' });
    expect(by(list, 'Quarterstaff')).toMatchObject({ props: 'versatile', vers: '1d8', mastery: 'topple' });
    expect(by(list, 'Longbow')).toMatchObject({ wcat: 'martial', wrange: 'ranged', dmg: '1d8', dtype: 'Piercing',
      props: 'ammunition,heavy,two-handed', ammo: '150/600;arrow', mastery: 'slow', wt: 2, cost: '50 GP' });
    expect(by(list, 'Heavy Crossbow')).toMatchObject({ dmg: '1d10', props: 'ammunition,heavy,loading,two-handed', ammo: '100/400;bolt' });
    expect(by(list, 'Blowgun')).toMatchObject({ dmg: '1', dtype: 'Piercing' });
    expect(by(list, 'Sling')!.wt).toBeUndefined();
  });
});

describe('armor', () => {
  const list = parseArmor(fx('armor-layout.txt'));
  it('reads kind, base AC, Strength and Stealth', () => {
    expect(list).toHaveLength(13);
    expect(by(list, 'Leather Armor')).toMatchObject({ cat: 'armor', armor: 'light', acBase: 11, wt: 10, cost: '10 GP' });
    expect(by(list, 'Leather Armor')!.stealthDis).toBeUndefined();
    expect(by(list, 'Hide Armor')).toMatchObject({ armor: 'medium', acBase: 12 });
    expect(by(list, 'Chain Mail')).toMatchObject({ armor: 'heavy', acBase: 16, strReq: 13, stealthDis: true, wt: 55 });
    expect(by(list, 'Shield')).toMatchObject({ cat: 'shield', armor: 'shield', acBase: 2, wt: 6 });
  });
});

describe('gear and tools', () => {
  const gear = parseGear(fx('gear.txt'), fx('gear-layout.txt'));
  it('reads the table, with descriptions and capacities from the text', () => {
    expect(by(gear, 'Backpack')).toMatchObject({ id: 'item/backpack', cat: 'gear', cost: '2 GP', wt: 5, cap: 30, capVol: '1 cubic foot',
      desc: 'A Backpack holds up to 30 pounds within 1 cubic foot. It can also serve as a saddlebag.' });
    expect(by(gear, 'Explorer’s Pack')).toMatchObject({ cat: 'pack', wt: 55, cost: '10 GP' });
    expect(by(gear, 'Explorer’s Pack')!.desc).toContain('10 Torches, and Waterskin.');
    // "Clothes, Traveler's" in the table reads as the name used in play
    expect(by(gear, 'Traveler’s Clothes')).toMatchObject({ id: 'item/travelers-clothes', wt: 4, cost: '2 GP' });
  });
  it('reads a capacity in pounds, or else the volume or count a container holds (plan 7)', () => {
    expect(capacityOf('A Backpack holds up to 30 pounds within 1 cubic foot. It can also serve as a saddlebag.')).toEqual({ cap: 30, capVol: '1 cubic foot' });
    expect(capacityOf('A Chest holds up to 12 cubic feet of contents.')).toEqual({ capVol: '12 cubic feet of contents' });
    expect(capacityOf('A Quiver holds up to 20 Arrows.')).toEqual({ capVol: '20 Arrows' });
    expect(capacityOf('A Waterskin holds up to 4 pints. If you don’t drink sufficient water, you risk dehydration.')).toEqual({ capVol: '4 pints' });
    expect(capacityOf('A Lamp burns for 6 hours.')).toEqual({});
  });
  it('reads the Glass Bottle’s extracted "11/2 pints" as 1½ pints, and no other number', () => {
    expect(srdLines('A Glass Bottle holds up to 11/2 pints.')[0].text).toBe('A Glass Bottle holds up to 1½ pints.');
    expect(srdLines('Range 11/2 miles')[0].text).toBe('Range 11/2 miles');
  });
  it('reads a heading split over two lines, and gives both Spell Scrolls its text (plan 7)', () => {
    const text = 'Signal Whistle (5 CP)\nWhen blown, it sounds.\n\nSpell Scroll (Cantrip, 30 GP;\nLevel 1, 50 GP)\n\nA Spell Scroll (Cantrip) or Spell Scroll (Level 1) is a magic item.\n';
    const layout = '  Signal Whistle    —    5 CP    Spell Scroll (Cantrip)    —    30 GP\n  Spell Scroll (Level 1)    —    50 GP\n';
    const gear = parseGear(text, layout);
    expect(by(gear, 'Signal Whistle')!.desc).toBe('When blown, it sounds.');
    expect(by(gear, 'Spell Scroll (Cantrip)')!.desc).toBe('A Spell Scroll (Cantrip) or Spell Scroll (Level 1) is a magic item.');
    expect(by(gear, 'Spell Scroll (Level 1)')!.desc).toBe(by(gear, 'Spell Scroll (Cantrip)')!.desc);
  });
  it('reads tools', () => {
    const tools = parseTools(fx('tools.txt'));
    expect(by(tools, 'Cartographer’s Tools')).toMatchObject({ id: 'item/cartographers-tools', cat: 'tool', cost: '15 GP', wt: 6 });
    expect(by(tools, 'Herbalism Kit')).toMatchObject({ cat: 'tool', cost: '5 GP', wt: 3 });
  });
});

describe('magic items', () => {
  const list = parseMagicItems(fx('magic.txt'));
  it('reads rarity, attunement, charges and a dawn regain', () => {
    expect(by(list, 'Wand of Magic Missiles')).toMatchObject({ cat: 'magic', rarity: 'Uncommon', charges: '7', recharge: 'dawn', regain: '1d6+1', regainOn: 'dawn' });
    expect(by(list, 'Wand of Magic Missiles')!.attune).toBeUndefined();
  });
  it('reads rolled, starting and "N of its M" charges, a singular regain, and no recharge when none comes back', () => {
    const one = (type: string, body: string) => parseMagicItems(`Test Item\n${type}\n\n${body}\n`)[0];
    expect(one('Weapon (Any Sword), Legendary', 'The weapon has 1d3 charges. While holding it, you can expend 1 charge.')).toMatchObject({ charges: '1d3', recharge: 'none' });
    expect(one('Weapon (Any Sword), Very Rare', 'The weapon has 1d8 + 1 charges.')).toMatchObject({ charges: '1d8+1', recharge: 'none' });
    expect(one('Ring, Legendary', 'While wearing this ring, you can expend 1 of its 3 charges to cast Wish from it.')).toMatchObject({ charges: '3', recharge: 'none' });
    expect(one('Wondrous Item, Rare', 'The cube starts with 10 charges, and it regains 1d6 expended charges daily at dawn.')).toMatchObject({ charges: '10', recharge: 'dawn', regain: '1d6' });
    expect(one('Rod, Legendary', 'The rod has 5 charges. The rod regains 1 expended charge daily at dawn.')).toMatchObject({ charges: '5', recharge: 'dawn', regain: '1', regainOn: 'dawn' });
    expect(one('Wondrous Item, Rare', 'No charges here.').recharge).toBeUndefined();
  });
  it('reads a weapon’s +N bonus as magic, and a staff wielded as a magic Quarterstaff as one', () => {
    const one = (type: string, body: string) => parseMagicItems(`Test Item\n${type}\n\n${body}\n`)[0];
    expect(one('Weapon (Any Sword), Legendary', 'You gain a +3 bonus to attack and damage rolls made with this magic weapon.').magic).toBe(3);
    expect(one('Weapon (Any Axe), Rare', 'You gain a +1 bonus to attack rolls and damage rolls made with this magic weapon.').magic).toBe(1);
    expect(one('Staff, Very Rare', 'This staff can be wielded as a magic Quarterstaff that grants a +2 bonus to attack and damage rolls made with it.'))
      .toMatchObject({ base: 'item/quarterstaff', magic: 2 });
    expect(one('Staff, Rare', 'This staff can be wielded as a magic Quarterstaff. On a hit, it deals extra Necrotic damage.')).toMatchObject({ base: 'item/quarterstaff' });
    expect(one('Staff, Rare', 'While holding this staff, you can cast Cure Wounds.').base).toBeUndefined();
    expect(one('Ring, Rare', 'You gain a +1 bonus to AC and saving throws.').magic).toBeUndefined();
  });
  it('checks a baseOf list names items of the kind its base allows', () => {
    const sword = { id: 'item/longsword', kind: 'item', name: 'Longsword', src: 'srd', desc: '', cat: 'weapon', dmg: '1d8' } as ItemEntry;
    const plate = { id: 'item/plate-armor', kind: 'item', name: 'Plate Armor', src: 'srd', desc: '', cat: 'armor', armor: 'heavy', acBase: 18 } as ItemEntry;
    const magic = (p: Partial<ItemEntry>) => ({ id: 'item/test', kind: 'item', name: 'Test', src: 'srd', desc: '', cat: 'magic', ...p }) as ItemEntry;
    expect(() => copyBase([sword, plate, magic({ base: 'weapon', baseOf: 'item/longsword' })])).not.toThrow();
    expect(() => copyBase([sword, plate, magic({ base: 'weapon', baseOf: 'item/plate-armor' })])).toThrow(/baseOf/);
    expect(() => copyBase([sword, plate, magic({ base: 'armor', baseOf: 'item/longsword' })])).toThrow(/baseOf/);
    expect(() => copyBase([sword, plate, magic({ base: 'armor', baseOf: 'item/nope' })])).toThrow(/baseOf/);
    expect(copyBase([sword, plate, magic({ base: 'item/longsword', magic: 1 })])[2]).toMatchObject({ dmg: '1d8', base: 'item/longsword', magic: 1 });
  });
  it('reads Bag of Holding’s capacity from its text', () => {
    expect(by(list, 'Bag of Holding')).toMatchObject({ rarity: 'Uncommon', xdim: true, cap: 500, capVol: '64 cubic feet', wt: 5 });
  });
});

it('reads focus forms, mounts, tack and large vehicles from their tables', () => {
  const layout = [
    '     Crystal                                 1 lb.           10 GP   Hooded Lantern, 7 flasks',
    '     Sprig of mistletoe                           —     1 GP    feet of yourself.',
    'A Torch burns      Emblem (borne on fabric or a Shield)         —         5 GP',
    '     Lamp, Lantern      Elephant                   1,320 lb.            200 GP',
    '     Torch      Carriage                           600 lb.       100 GP',
    '     Saddle',
    '     Vial      Exotic                               40 lb.     60 GP',
    '     Vial      Horse, Riding               480 lb.            75 GP',
    '      Airship          8 mph      10          20               1           13      300           —               40,000 GP'
  ].join('\n');
  const list = parseMounts(layout);
  const by = (n: string) => list.find((e) => e.name === n);
  expect(by('Arcane Focus (Crystal)')).toMatchObject({ id: 'item/arcane-focus-crystal', cat: 'focus', wt: 1, cost: '10 GP' });
  expect(by('Druidic Focus (Sprig of Mistletoe)')).toMatchObject({ cat: 'focus', cost: '1 GP' });
  expect(by('Druidic Focus (Sprig of Mistletoe)')!.wt).toBeUndefined();
  expect(by('Holy Symbol (Emblem)')).toMatchObject({ cat: 'focus', cost: '5 GP', desc: 'Borne on fabric or a Shield. A Cleric or Paladin can use it as a Spellcasting Focus.' });
  expect(by('Elephant')).toMatchObject({ cat: 'mount', cost: '200 GP', desc: 'Carrying capacity 1,320 lb.' });
  expect(by('Elephant')!.wt).toBeUndefined();
  expect(by('Carriage')).toMatchObject({ cat: 'mount', wt: 600, cost: '100 GP' });
  expect(by('Saddle, Exotic')).toMatchObject({ cat: 'mount', wt: 40, cost: '60 GP' });
  expect(by('Saddle, Riding')).toBeUndefined();
  expect(by('Horse, Riding')).toMatchObject({ cat: 'mount', cost: '75 GP' });
  expect(by('Airship')).toMatchObject({ cat: 'mount', cost: '40,000 GP', desc: 'Speed 8 mph; Crew 10; Passengers 20; Cargo 1 tons; AC 13; HP 300; Damage Threshold —.' });
  for (const e of list) expect(validateEntry(e)).toEqual([]);
});

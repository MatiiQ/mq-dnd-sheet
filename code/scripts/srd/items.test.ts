import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseArmor, parseGear, parseMagicItems, parseTools, parseWeapons } from './items.ts';

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
  it('reads Bag of Holding’s capacity from its text', () => {
    expect(by(list, 'Bag of Holding')).toMatchObject({ rarity: 'Uncommon', xdim: true, cap: 500, capVol: '64 cubic feet', wt: 5 });
  });
});

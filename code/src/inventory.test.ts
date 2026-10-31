import { describe, expect, it } from 'vitest';
import { blankCharacter } from './defaults';
import { draftFromItem, itemFromForm } from './catalog/copy';
import {
  addSection, containerLoad, DEFAULT_SECTION, inventoryGroups, moveInto, moveSection, removeContainer, removeContainerSummary, removeSection, renameSection,
  setItemSection, takeOut
} from './inventory';
import { carriedWeight, fixContainers, migrate, normalize, removeItem } from './logic';
import { saveEntry } from './sheet';
import { applyPatch } from './storage';
import { shortsword } from './test-fixtures';
import type { Character, Grant, Item } from './types';

const item = (p: Partial<Item>): Item => ({ id: 'x', name: 'X', qty: 1, eq: false, ...p });
const make = (p: Partial<Character> = {}): Character => ({ ...blankCharacter(), ...p });
const raw = (c: Character) => JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
const names = (c: Character) => c.sections.map((s) => s.name);
const groupOf = (c: Character, itemId: string) => inventoryGroups(c).find((g) => g.items.some((i) => i.id === itemId));

// Weapons, then Armour; a Shortsword in Weapons, a Rope with no section.
function twoSections(): { c: Character; weapons: string; armour: string } {
  const c = addSection(addSection(make({ inv: [item({ id: 'sw', name: 'Shortsword', eq: true }), item({ id: 'rope', name: 'Rope' })] }), 'Weapons'), 'Armour');
  const [weapons, armour] = c.sections.map((s) => s.id);
  return { c: setItemSection(c, 'sw', weapons), weapons, armour };
}

describe('sections', () => {
  it('adds sections in order, trimmed', () => {
    const { c } = twoSections();
    expect(names(c)).toEqual(['Weapons', 'Armour']);
    expect(names(addSection(c, '  Gear '))).toEqual(['Weapons', 'Armour', 'Gear']);
  });

  it('a new character starts with no sections', () => {
    expect(blankCharacter().sections).toEqual([]);
    expect(inventoryGroups(make({ inv: [item({ id: 'a' })] }))).toEqual([{ sec: null, items: [item({ id: 'a' })] }]);
  });

  it('moves a section up or down', () => {
    const { c, armour } = twoSections();
    expect(names(moveSection(c, armour, -1))).toEqual(['Armour', 'Weapons']);
  });

  it('removing a section sends its items to the default list', () => {
    const { c, weapons } = twoSections();
    const out = removeSection(c, weapons);
    expect(names(out)).toEqual(['Armour']);
    expect(out.inv.find((i) => i.id === 'sw')!.sec).toBeUndefined();
    expect(groupOf(out, 'sw')!.sec).toBeNull();
  });

  it('groups items: sections in order, then the default list', () => {
    const { c, weapons, armour } = twoSections();
    const g = inventoryGroups(c);
    expect(g.map((x) => x.sec?.id ?? null)).toEqual([weapons, armour, null]);
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([['sw'], [], ['rope']]);
    expect(DEFAULT_SECTION).toBe('Other items');
  });

  it('lists an item whose section is missing in the default list, and migrate() clears it', () => {
    const { c } = twoSections();
    const lost = { ...c, inv: c.inv.map((i) => (i.id === 'rope' ? { ...i, sec: 'gone' } : i)) };
    expect(groupOf(lost, 'rope')!.sec).toBeNull();
    expect(migrate(raw(lost)).inv.find((i) => i.id === 'rope')!.sec).toBeUndefined();
  });

  it('migrate() gives a save without sections an empty list', () => {
    const r = raw(make());
    delete r.sections;
    expect(migrate(r).sections).toEqual([]);
  });

  it('migrate() keeps sections and their items', () => {
    const { c, weapons } = twoSections();
    const m = migrate(raw(c));
    expect(m.sections).toEqual(c.sections);
    expect(m.inv.find((i) => i.id === 'sw')!.sec).toBe(weapons);
  });

  it('migrate() drops sections with a duplicate id or a blank name', () => {
    const r = raw(make({ inv: [item({ id: 'a', sec: 's1' })] }));
    r.sections = [{ id: 's1', name: 'Weapons' }, { id: 's1', name: 'Copy' }, { id: 's2', name: '  ' }, { id: 's3', name: 'Gear' }, { name: 'No id' }, 'junk'];
    const m = migrate(r);
    expect(m.sections.map((s) => [s.id, s.name])).toEqual([['s1', 'Weapons'], ['s3', 'Gear'], [m.sections[2].id, 'No id']]);
    expect(typeof m.sections[2].id).toBe('string');
    // The item named the dropped duplicate's id, which the first section still has.
    expect(m.inv[0].sec).toBe('s1');
  });

  it('migrate() drops a sec that is not a non-empty string, keeping the item', () => {
    const r = raw(make({ sections: [{ id: 's1', name: 'Weapons' }] }));
    r.inv = [{ id: 'a', name: 'A', qty: 1, eq: false, sec: true }, { id: 'b', name: 'B', qty: 1, eq: false, sec: 5 }, { id: 'c', name: 'C', qty: 1, eq: false, sec: '' }];
    const m = migrate(r);
    expect(m.inv.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(m.inv.every((i) => !('sec' in i))).toBe(true);
  });

  it('setItemSection moves an item and keeps it equipped', () => {
    const { c, armour } = twoSections();
    const out = setItemSection(c, 'sw', armour);
    expect(out.inv.find((i) => i.id === 'sw')).toMatchObject({ sec: armour, eq: true });
    expect(setItemSection(out, 'sw', null).inv.find((i) => i.id === 'sw')!.sec).toBeUndefined();
  });

  it('setItemSection with an unknown section or item returns the same character', () => {
    const { c, weapons } = twoSections();
    expect(setItemSection(c, 'sw', 'nope')).toBe(c);
    expect(setItemSection(c, 'nope', weapons)).toBe(c);
  });

  it('refuses blank names, unknown ids and moves past the ends', () => {
    const { c, weapons, armour } = twoSections();
    expect(addSection(c, '  ')).toBe(c);
    expect(renameSection(c, weapons, '  ')).toBe(c);
    expect(renameSection(c, 'nope', 'Arms')).toBe(c);
    expect(removeSection(c, 'nope')).toBe(c);
    expect(moveSection(c, 'nope', 1)).toBe(c);
    expect(moveSection(c, weapons, -1)).toBe(c);
    expect(moveSection(c, armour, 1)).toBe(c);
  });

  it('renames a section, trimmed', () => {
    const { c, weapons } = twoSections();
    expect(names(renameSection(c, weapons, '  Arms '))).toEqual(['Arms', 'Armour']);
  });
});

// Bag of Holding and Handy Haversack as in the SRD 5.2 catalog (item/bag-of-holding, item/handy-haversack).
const bag = (p: Partial<Item> = {}): Item => item({ id: 'bag', name: 'Bag of Holding', wt: 5, xdim: true, cap: 500, capVol: '64 cubic feet', cat: 'magic', ...p });
const sack = (p: Partial<Item> = {}): Item => item({ id: 'sack', name: 'Handy Haversack', wt: 5, xdim: true, cap: 900, cat: 'magic', ...p });
const rock = (p: Partial<Item> = {}): Item => item({ id: 'rock', name: 'Rock', wt: 20, in: 'bag', ...p });
const rope = (p: Partial<Item> = {}): Item => item({ id: 'rope', name: 'Rope', wt: 5, ...p });
const find = (c: Character, id: string) => c.inv.find((i) => i.id === id)!;
// Saves an item through the custom form as the edit form does, with its draft changed.
const saveForm = (c: Character, id: string, d: Partial<ReturnType<typeof draftFromItem>>) =>
  applyPatch(c, (p) => ({ inv: saveEntry<Item>(p.inv, itemFromForm({ ...draftFromItem(find(p, id)), ...d }), id) }));

describe('containers', () => {
  it('counts the bag but not its contents or coins toward the load', () => {
    const c = make({ inv: [bag({ gp: 100 }), rock()] });
    expect(carriedWeight(c)).toBe(5);
    expect(containerLoad(c, 'bag')).toEqual({ items: 20, coins: 2, total: 22, cap: 500 });
  });

  it('lists items in a container in no section group', () => {
    const c = make({ inv: [bag(), rock()] });
    expect(inventoryGroups(c)).toEqual([{ sec: null, items: [bag()] }]);
  });

  it('moveInto unequips the item and takes it out of hand', () => {
    const c = make({ inv: [bag(), shortsword({ id: 'sw' })], hands: ['sw'] });
    const out = moveInto(c, 'sw', 'bag');
    expect(find(out, 'sw')).toMatchObject({ in: 'bag', eq: false });
    expect(out.hands).toEqual([]);
  });

  it('moveInto refuses containers, itself, non-containers and missing ids', () => {
    const c = make({ inv: [bag(), sack(), shortsword({ id: 'sw' })] });
    expect(moveInto(c, 'sack', 'bag')).toBe(c);
    expect(moveInto(c, 'bag', 'bag')).toBe(c);
    expect(moveInto(c, 'bag', 'sw')).toBe(c);
    expect(moveInto(c, 'rope', 'sw')).toBe(c);
    expect(moveInto(c, 'nope', 'bag')).toBe(c);
    expect(moveInto(c, 'sw', 'nope')).toBe(c);
  });

  it('moves an item straight from one container to another', () => {
    const c = make({ inv: [bag(), sack(), rock()] });
    expect(find(moveInto(c, 'rock', 'sack'), 'rock').in).toBe('sack');
  });

  it('takeOut keeps the section; nothing to take out returns the same character', () => {
    const c = make({ sections: [{ id: 's1', name: 'Gear' }], inv: [bag(), rock({ sec: 's1' }), rope()] });
    const out = takeOut(c, 'rock');
    expect(find(out, 'rock')).toEqual({ id: 'rock', name: 'Rock', qty: 1, eq: false, wt: 20, sec: 's1' });
    expect(takeOut(c, 'rope')).toBe(c);
    expect(takeOut(c, 'nope')).toBe(c);
  });

  it('setItemSection takes an item out of its container', () => {
    const c = make({ sections: [{ id: 's1', name: 'Gear' }], inv: [bag(), rock()] });
    const out = setItemSection(c, 'rock', 's1');
    expect(find(out, 'rock').sec).toBe('s1');
    expect(find(out, 'rock').in).toBeUndefined();
  });

  it('removeContainerSummary lists a content item\'s counted grant only when the contents go too', () => {
    const belt: Grant = { id: 'g1', kind: 'abil', name: 'Belt', ab: 'str', val: '2', from: 'item:belt', counted: true };
    const c = make({ inv: [bag(), item({ id: 'belt', name: 'Belt of Might', in: 'bag' })], grants: [belt] });
    const remove = removeContainerSummary(c, 'bag', 'remove'), out = removeContainerSummary(c, 'bag', 'out');
    expect(remove.keep.some((k) => k.includes('Belt of Might'))).toBe(true);
    expect(remove.goes).toContain('Belt of Might');
    expect(out).toEqual({ goes: [], keep: [] });
  });

  it('removing the bag takes its contents and coins out, unless the contents go too', () => {
    const c = make({ coins: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 }, inv: [bag({ gp: 100 }), rock()] });
    const out = removeContainer(c, 'bag', 'out');
    expect(out.inv).toEqual([{ id: 'rock', name: 'Rock', qty: 1, eq: false, wt: 20 }]);
    expect(out.coins.gp).toBe(110);
    const gone = removeContainer(c, 'bag', 'remove');
    expect(gone.inv).toEqual([]);
    expect(gone.coins).toEqual(c.coins);
    // The Edit-mode path: plain item removal.
    expect(removeItem(c, 'bag')).toEqual(out);
  });

  it('one bag row is one container whatever its quantity', () => {
    const c = make({ inv: [bag({ qty: 2, gp: 50 }), rock()] });
    expect(containerLoad(c, 'bag').cap).toBe(500);
    expect(carriedWeight(c)).toBe(10);
    const zero = normalize(make({ inv: [bag({ qty: 0, gp: 50 }), rock()] }));
    expect(find(zero, 'rock').in).toBe('bag');
    expect(find(zero, 'bag').gp).toBe(50);
    expect(carriedWeight(zero)).toBe(0);
  });

  it('a bag switched to another kind in the edit form lets its contents and coins out', () => {
    const c = make({ coins: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 }, inv: [bag({ gp: 50 }), rope({ in: 'bag' })] });
    for (const d of [{ kind: 'none' as const }, { kind: 'container' as const, xdim: false }]) {
      const out = saveForm(c, 'bag', d);
      expect(find(out, 'rope').in).toBeUndefined();
      expect(inventoryGroups(out)[0].items.map((i) => i.id)).toEqual(['bag', 'rope']);
      expect(carriedWeight(out)).toBe(5 + 5 + 10 / 50 + 50 / 50);
      expect(['cp', 'sp', 'ep', 'gp', 'pp'].some((k) => k in find(out, 'bag'))).toBe(false);
      expect(out.coins.gp).toBe(60);
    }
  });

  it('an item inside that becomes an extradimensional container comes out', () => {
    const c = make({ inv: [bag(), rope({ in: 'bag' })] });
    expect(find(saveForm(c, 'rope', { kind: 'container', xdim: true }), 'rope').in).toBeUndefined();
    expect(find(saveForm(c, 'rope', { kind: 'container', xdim: false }), 'rope').in).toBe('bag');
  });

  it('fixContainers returns the same character when nothing is wrong', () => {
    const c = make({ inv: [bag({ gp: 5 }), rock()] });
    expect(fixContainers(c)).toBe(c);
  });
});

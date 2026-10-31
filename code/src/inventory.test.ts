import { describe, expect, it } from 'vitest';
import { blankCharacter } from './defaults';
import { addSection, DEFAULT_SECTION, inventoryGroups, moveSection, removeSection, renameSection, setItemSection } from './inventory';
import { migrate } from './logic';
import type { Character, Item } from './types';

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

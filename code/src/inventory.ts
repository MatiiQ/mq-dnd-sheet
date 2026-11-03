// The item list in sections (plan 6): sections the player names and orders, and moving items between them.
// Pure functions (Character → Character), each returning c itself when nothing changes. Imported by components and
// tests only; logic.ts never imports this file.
import { itemOf, setHands } from './hands';
import { removeRef, COINS, coinWeight, isContainer, newId, removalSummary, withoutKeys } from './logic';
import type { Character, Item, Section } from './types';

// The list for items with no section (or one that is gone): always last, never renamed or removed.
export const DEFAULT_SECTION = 'Other items';

const hasSection = (c: Character, id: string) => c.sections.some((s) => s.id === id);

export function addSection(c: Character, name: string): Character {
  const n = name.trim();
  return n ? { ...c, sections: [...c.sections, { id: newId(), name: n }] } : c;
}

// A blank name is refused: migrate() drops blank-named sections, so the section would be lost on reload.
export function renameSection(c: Character, id: string, name: string): Character {
  const n = name.trim();
  if (!n || !hasSection(c, id)) return c;
  return { ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, name: n } : s)) };
}

export function moveSection(c: Character, id: string, dir: -1 | 1): Character {
  const i = c.sections.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= c.sections.length) return c;
  const sections = [...c.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...c, sections };
}

// Its items go back to the default list.
export function removeSection(c: Character, id: string): Character {
  if (!hasSection(c, id)) return c;
  return { ...c, sections: c.sections.filter((s) => s.id !== id), inv: c.inv.map((i) => (i.sec === id ? withoutKeys(i, ['sec']) : i)) };
}

// Puts an item in a section (null: the default list). Picking a section also takes the item out of its container.
export function setItemSection(c: Character, itemId: string, sec: string | null): Character {
  if (!itemOf(c, itemId) || (sec !== null && !hasSection(c, sec))) return c;
  return { ...c, inv: c.inv.map((i) => (i.id !== itemId ? i : sec === null ? withoutKeys(i, ['in', 'sec']) : { ...withoutKeys(i, ['in']), sec })) };
}

// The sections in order, then the default list (sec null) last, each with its items in list order.
export function inventoryGroups(c: Character): { sec: Section | null; items: Item[] }[] {
  const own = (i: Item) => (i.sec !== undefined && hasSection(c, i.sec) ? i.sec : null);
  return [...c.sections, null].map((sec) => ({ sec, items: c.inv.filter((i) => !i.in && own(i) === (sec?.id ?? null)) }));
}

// Puts an item into an extradimensional container (straight across from another one). The item is no longer equipped
// or in hand; an attunement slot keeps it and shows "not equipped". The whole row moves (no partial-quantity split).
// Refused (c itself) for a missing item or container, a container target that isn't one, a container item, or itself.
export function moveInto(c: Character, itemId: string, bagId: string): Character {
  const it = itemOf(c, itemId), bag = itemOf(c, bagId);
  if (!it || !bag || !isContainer(bag) || isContainer(it) || itemId === bagId) return c;
  const next = { ...c, inv: c.inv.map((i) => (i.id === itemId ? { ...i, in: bagId, eq: false } : i)) };
  return setHands(next, next.hands.filter((id) => id !== itemId));
}

// Takes an item out of its container, back to its section (or the default list).
export function takeOut(c: Character, itemId: string): Character {
  const it = itemOf(c, itemId);
  return it?.in ? { ...c, inv: c.inv.map((i) => (i.id === itemId ? withoutKeys(i, ['in']) : i)) } : c;
}

const contentsOf = (c: Character, bagId: string) => c.inv.filter((i) => i.in === bagId);

// Removes a container. 'out' is the plain item removal: its contents come out and its coins go to the purse. 'remove'
// removes each content item through the same removal, then the bag with its coins.
export function removeContainer(c: Character, bagId: string, contents: 'out' | 'remove'): Character {
  if (contents === 'out') return removeRef(c, { kind: 'item', id: bagId });
  const emptied = contentsOf(c, bagId).reduce((x, i) => removeRef(x, { kind: 'item', id: i.id }), c);
  return removeRef({ ...emptied, inv: emptied.inv.map((i) => (i.id === bagId ? withoutKeys(i, COINS) : i)) }, { kind: 'item', id: bagId });
}

// What the removal confirm shows: the bag's removalSummary, plus with 'remove' each content item (by name) and its own
// removalSummary, once each.
export function removeContainerSummary(c: Character, bagId: string, contents: 'out' | 'remove'): { goes: string[]; keep: string[] } {
  const own = removalSummary(c, { kind: 'item', id: bagId });
  if (contents === 'out') return own;
  const parts = contentsOf(c, bagId).map((i) => { const s = removalSummary(c, { kind: 'item', id: i.id }); return { goes: [i.name, ...s.goes], keep: s.keep }; });
  const once = (xs: string[]) => [...new Set(xs)];
  return { goes: once([...own.goes, ...parts.flatMap((p) => p.goes)]), keep: once([...own.keep, ...parts.flatMap((p) => p.keep)]) };
}

// A container's load in lb: its contents (weight × quantity) and its coins (fifty to the pound, PHB p.213), against its
// capacity (null: none given, as for a Portable Hole). One row is one container whatever its quantity: one block, one
// set of coins, one capacity (not multiplied); its own weight counts wt × qty toward the character like any item. The
// Handy Haversack's 900 lb is its central pouch (500 lb) and two side pouches (200 lb each) as one total; the
// per-pouch limits are not modelled (a deliberate simplification).
export function containerLoad(c: Character, bagId: string): { items: number; coins: number; total: number; cap: number | null } {
  const bag = itemOf(c, bagId);
  const items = contentsOf(c, bagId).reduce((t, i) => t + (i.wt || 0) * i.qty, 0);
  const coins = coinWeight(bag ?? {});
  return { items, coins, total: items + coins, cap: bag?.cap ?? null };
}

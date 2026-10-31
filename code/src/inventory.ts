// The item list in sections (plan 6): sections the player names and orders, and moving items between them.
// Pure functions (Character → Character), each returning c itself when nothing changes. Imported by components and
// tests only; logic.ts never imports this file.
import { newId } from './logic';
import type { Character, Item, Section } from './types';

// The list for items with no section (or one that is gone): always last, never renamed or removed.
export const DEFAULT_SECTION = 'Other items';

const hasSection = (c: Character, id: string) => c.sections.some((s) => s.id === id);
const withoutSec = (it: Item): Item => { const { sec: _, ...rest } = it; return rest; };

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
  return { ...c, sections: c.sections.filter((s) => s.id !== id), inv: c.inv.map((i) => (i.sec === id ? withoutSec(i) : i)) };
}

// Puts an item in a section (null: the default list).
export function setItemSection(c: Character, itemId: string, sec: string | null): Character {
  if (!c.inv.some((i) => i.id === itemId) || (sec !== null && !hasSection(c, sec))) return c;
  return { ...c, inv: c.inv.map((i) => (i.id !== itemId ? i : sec === null ? withoutSec(i) : { ...i, sec })) };
}

// The sections in order, then the default list (sec null) last, each with its items in list order.
export function inventoryGroups(c: Character): { sec: Section | null; items: Item[] }[] {
  const own = (i: Item) => (i.sec !== undefined && hasSection(c, i.sec) ? i.sec : null);
  return [...c.sections, null].map((sec) => ({ sec, items: c.inv.filter((i) => own(i) === (sec?.id ?? null)) }));
}

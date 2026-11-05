import type { PillTarget } from '../logic';
import { parseLink, sourceOf } from '../links';
import type { Character, Tab } from '../types';

// Jumps to where a chip's entry lives, the way pills do: a tab opens (and its column scrolls into view), a section scrolls.
export function jumpTo(t: PillTarget, update: (p: Partial<Character>) => void): void {
  if ('tab' in t) {
    update({ tab: t.tab });
    setTimeout(() => document.getElementById('sec-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    return;
  }
  document.getElementById(t.sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// A row that a shortcut goes to and opens (reveal, in the Sheet context).
export type RevealTarget = { kind: 'feature' | 'item' | 'spell' | 'res'; id: string };

// The target of a `from` link whose source is still on the sheet; null for a dangling link or a named-only source.
export function revealOf(c: Character, from: string | undefined): RevealTarget | null {
  const p = parseLink(from);
  return p && sourceOf(c, from) ? { kind: p.kind, id: p.id } : null;
}

const PLACES: Record<RevealTarget['kind'], { tab?: Tab; sec?: string; pre: string }> = {
  feature: { tab: 'features', pre: 'feat-' }, item: { tab: 'inventory', pre: 'item-' },
  spell: { tab: 'spells', pre: 'spell-' }, res: { sec: 'sec-resources', pre: 'res-' }
};
// Where a target lives: the tab to switch to or the section to scroll to, and the row's DOM id.
export function revealPlace(t: RevealTarget): { tab?: Tab; sec?: string; dom: string } {
  const { pre, ...at } = PLACES[t.kind];
  return { ...at, dom: pre + t.id };
}

import type { PillTarget } from '../logic';
import type { Character } from '../types';

// Jumps to where a chip's entry lives, the way pills do: a tab opens (and its column scrolls into view), a section scrolls.
export function jumpTo(t: PillTarget, update: (p: Partial<Character>) => void): void {
  if ('tab' in t) {
    update({ tab: t.tab });
    setTimeout(() => document.getElementById('sec-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    return;
  }
  document.getElementById(t.sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The Actions tab, computed from the sheet (plan 5): weapon attacks, Unarmed Strike, spells, feature actions and extra
// damage. Pure functions of the character; nothing here is stored.
import { slug } from './catalog/schema';
import { activeGrants } from './links';
import { num } from './logic';
import type { Character } from './types';

// Weapon Mastery: the number of weapon kinds whose mastery properties the character can use, from the active
// prof 'mastery' grants without a target (Fighter 3, 4 from level 4; Ranger 2 …).
export const masterySlots = (c: Character) =>
  activeGrants(c, 'prof').filter((g) => g.cat === 'mastery' && !g.target).reduce((t, g) => t + num(c, g.val), 0);
// A weapon kind (a weaponKind slug) counts when it is among the first masterySlots picks, or an active mastery grant
// names it (grant targets are weapon names, so they compare as slugs). Picks past the slot count stay stored.
export function hasMastery(c: Character, kind: string): boolean {
  if (c.mastery.slice(0, masterySlots(c)).includes(kind)) return true;
  return activeGrants(c, 'prof').some((g) => g.cat === 'mastery' && !!g.target && slug(g.target) === kind);
}

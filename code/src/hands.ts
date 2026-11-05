// What the character holds (plan 5): `hands` lists item ids, oldest first, one entry per hand. Every change goes through
// setHands, which keeps the list valid and ends effects that need the weapon held. Imports types, links.ts and the
// catalog's slug only, so logic.ts can use it without an import cycle.
import { slug } from './catalog/schema';
import { activeGrants, isEquipped, sourceOf } from './links';
import type { Character, Item } from './types';

const propsOf = (it: Item) => (it.props ?? '').split(',').map((p) => p.trim()).filter(Boolean);
export const hasProp = (it: Item, p: string) => propsOf(it).includes(p);
export const isWeapon = (it: Item) => it.cat === 'weapon' || !!it.wcat;
export const twoHanded = (it: Item) => hasProp(it, 'two-handed');
export const versatile = (it: Item) => hasProp(it, 'versatile');

// Ammunition types (plan 7). A weapon's is the part of its Ammunition field after ';' ('150/600;arrow'; PHB p.213:
// the ammunition type is listed with the range). An ammunition item's comes from its catalog id, or from its base for
// Ammunition +N; ammunition typed by hand has no type. A Musket and a Pistol list "Bullet" but fire Firearm Bullets
// (PHB p.222), not a Sling's: the rule lives here, not in the data, because saves already hold ';bullet' on them.
const AMMO_TYPE: Record<string, string> = { 'item/arrows': 'arrow', 'item/bolts': 'bolt', 'item/sling-bullets': 'bullet', 'item/firearm-bullets': 'firearm', 'item/needles': 'needle' };
export function ammoType(it: Item): string {
  if (isWeapon(it)) return ['musket', 'pistol'].includes(weaponKind(it)) ? 'firearm' : (it.ammo ?? '').split(';')[1] ?? '';
  return AMMO_TYPE[it.cid ?? ''] ?? (it.cid === 'item/ammunition-1-2-or-3' ? AMMO_TYPE[it.base ?? ''] ?? '' : '');
}
// A weapon with the Ammunition property can be loaded with ammunition of its own type.
export const canLoad = (weapon: Item, ammo: Item) =>
  isWeapon(weapon) && hasProp(weapon, 'ammunition') && !isWeapon(ammo) && ammoType(weapon) !== '' && ammoType(weapon) === ammoType(ammo);
// The kind of weapon: a magic weapon's base item ('item/dagger' for a Dagger of Venom), else the catalog id's last
// segment ('item/longbow' → 'longbow'), else the name as a slug without a leading or trailing '+N' ("Longsword +1").
export function weaponKind(it: Item): string {
  const id = it.base ?? it.cid;
  if (id) return id.split('/').pop()!;
  return slug(it.name.trim().replace(/^\+\d+\s+/, '').replace(/\s+\+\d+$/, ''));
}
// A comma list of weapon kinds ('club,quarterstaff') and categories: 'simple', 'martial-melee', 'simple-ranged', and
// with a property after it, 'martial-melee-light' = a Martial Melee weapon that has the Light property.
export function weaponMatches(it: Item, list: string): boolean {
  // As slugs, so a typed 'Longsword' or 'Martial Melee' matches.
  return list.split(',').map(slug).filter(Boolean).some((term) => {
    const m = /^(simple|martial)(?:-(melee|ranged))?(?:-([a-z-]+))?$/.exec(term);
    if (!m) return term === weaponKind(it);
    return it.wcat === m[1] && (!m[2] || it.wrange === m[2]) && (!m[3] || hasProp(it, m[3]));
  });
}

export const itemOf = (c: Character, id: string) => c.inv.find((i) => i.id === id);
const withEquipped = (c: Character, id: string): Character => ({ ...c, inv: c.inv.map((i) => (i.id === id ? { ...i, eq: true } : i)) });
export const shieldOn = (c: Character) => c.inv.some((i) => isEquipped(i) && i.armor === 'shield');

// Whole weapons in hand, oldest first. A Two-Handed id twice is one weapon; a Versatile id twice is its two-handed use
// (two Versatile weapons of one row held one-handed are not modelled); any other entry is one weapon.
export function weaponsHeld(c: Character, hands: string[] = c.hands): { id: string; two: boolean }[] {
  const out: { id: string; two: boolean }[] = [];
  for (const id of hands) {
    const it = itemOf(c, id);
    const pair = !!it && (twoHanded(it) || versatile(it));
    const prev = pair ? out.find((w) => w.id === id) : undefined;
    if (prev) prev.two = true; else out.push({ id, two: !!it && twoHanded(it) });
  }
  return out;
}

// The hands rules (spec, "Equipped and in hand"): only equipped weapons with quantity 1 or more; a Two-Handed weapon
// exactly twice (once → dropped); the same id twice only for Two-Handed, Versatile (its two-handed use) or a row with
// quantity 2 or more; a row held as at most as many weapons as its quantity; two hands, one with an equipped Shield.
// Anything over goes from the front, one whole weapon at a time (a Dagger × 2 row in both hands is two weapons).
export function trimHands(c: Character, hands: string[]): string[] {
  const ok = hands.filter((id) => { const it = itemOf(c, id); return !!it && isEquipped(it) && isWeapon(it); });
  const units: { id: string; n: number }[] = [];
  for (const id of ok) {
    const it = itemOf(c, id)!;
    const prev = twoHanded(it) || versatile(it) ? units.find((u) => u.id === id) : undefined;
    if (prev) prev.n = 2; else units.push({ id, n: 1 });
  }
  let keep = units.filter((u) => !(twoHanded(itemOf(c, u.id)!) && u.n < 2));
  // More weapons of a row than it has: the older ones go.
  keep = keep.filter((u, i) => keep.slice(i + 1).filter((v) => v.id === u.id).length < itemOf(c, u.id)!.qty);
  const cap = shieldOn(c) ? 1 : 2;
  while (keep.reduce((t, u) => t + u.n, 0) > cap) keep = keep.slice(1);
  return keep.flatMap((u) => Array<string>(u.n).fill(u.id));
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// The only writer of c.hands: writes trimHands(c, next), then ends each switched-on effect (in effectsOn) whose active
// atkAbil grant names weapons, when the old hands held a matching weapon and the new ones hold none. Shillelagh ends
// early if you let go of the weapon (PHB p.316). An empty `hands` never ends anything: nothing was let go. Only links
// in effectsOn end: a Concentration spell with such a grant (on through conc) is deliberately left alone; no catalog
// spell has one today. Returns c itself when nothing changes, so normalize() keeps returning the same object.
export function setHands(c: Character, next: string[]): Character {
  const hands = trimHands(c, next);
  const held = (list: string[], weapons: string) => list.map((id) => itemOf(c, id)).find((it) => it && weaponMatches(it, weapons));
  const ending = activeGrants(c, 'atkAbil').filter((g) => g.weapons && c.effectsOn.includes(g.from) && held(c.hands, g.weapons) && !held(hands, g.weapons));
  const links = [...new Set(ending.map((g) => g.from))];
  if (!links.length) return sameList(hands, c.hands) ? c : { ...c, hands };
  let restMsg = c.restMsg;
  for (const link of links) {
    const g = ending.find((x) => x.from === link)!;
    const title = (sourceOf(c, link)?.name ?? g.name) + ' ended', body = 'You let go of the ' + held(c.hands, g.weapons!)!.name + '.';
    restMsg = restMsg ? { title: restMsg.title, body: restMsg.body + '\n' + title + ': ' + body } : { title, body };
  }
  return { ...c, hands, effectsOn: c.effectsOn.filter((l) => !links.includes(l)), restMsg };
}

// Takes a weapon in hand (two: a Versatile weapon's two-handed use; a Two-Handed weapon always takes both hands).
// A carried weapon is equipped first, otherwise trimHands would drop it at once. Two hands while a Shield is equipped
// is refused (blocked), so nothing already held is put away for nothing. A weapon held once whose row has 2 or more
// (not Versatile or Two-Handed) gets a second entry: the other hand takes the second Dagger. Otherwise a weapon already
// held is taken again whole, and the oldest weapons go to make room.
export function putInHand(c: Character, id: string, two = false): { c: Character; blocked?: 'shield' } {
  const it = itemOf(c, id);
  if (!it || !isWeapon(it)) return { c };
  const both = twoHanded(it) || (two && versatile(it));
  if (both && shieldOn(c)) return { c, blocked: 'shield' };
  const base = it.eq ? c : withEquipped(c, id);
  const once = base.hands.filter((x) => x === id).length === 1;
  const next = once && !twoHanded(it) && !versatile(it) && it.qty >= 2
    ? [...base.hands, id]
    : [...base.hands.filter((x) => x !== id), ...(both ? [id, id] : [id])];
  return { c: setHands(base, next) };
}

export const putAway = (c: Character, id: string): Character => setHands(c, c.hands.filter((x) => x !== id));

// Equips a Shield: it takes a hand, so a Versatile weapon held in two moves to one and hands trim to one entry (a
// Two-Handed weapon always goes).
export function equipShield(c: Character, id: string): Character {
  const base = withEquipped(c, id);
  return setHands(base, base.hands.filter((x, i, all) => all.indexOf(x) === i || !versatile(itemOf(c, x)!)));
}

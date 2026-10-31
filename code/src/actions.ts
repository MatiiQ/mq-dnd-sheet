// The Actions tab, computed from the sheet (plan 5): weapon attacks, Unarmed Strike, spells, feature actions and extra
// damage. Pure functions of the character; nothing here is stored.
import { slug } from './catalog/schema';
import { valueAt } from './catalog/value';
import { hasProp, twoHanded, versatile, weaponKind, weaponMatches, weaponsHeld } from './hands';
import { activeGrants, sourceOf } from './links';
import { ABILITIES, abilityMod, normName, num, profBonus, profList, hasProf, valueCtx, type AcPart } from './logic';
import type { Ability, Character, Econ, Grant, Item, Spell } from './types';

// Weapon Mastery: the number of weapon kinds whose mastery properties the character can use, from the active
// prof 'mastery' grants without a target (Fighter 3, 4 from level 4, PHB p.91; Ranger 2 …).
export const masterySlots = (c: Character) =>
  activeGrants(c, 'prof').filter((g) => g.cat === 'mastery' && !g.target).reduce((t, g) => t + num(c, g.val), 0);
// A weapon kind (a weaponKind slug) counts when it is among the first masterySlots picks, or an active mastery grant
// names it (grant targets are weapon names, so they compare as slugs). Picks past the slot count stay stored.
export function hasMastery(c: Character, kind: string): boolean {
  if (c.mastery.slice(0, masterySlots(c)).includes(kind)) return true;
  return activeGrants(c, 'prof').some((g) => g.cat === 'mastery' && !!g.target && slug(g.target) === kind);
}

// Damage text: dice and a modifier with a real minus, as fmt() writes it: '1d8+4', '1d6−1', '1d4' for 0. With no dice,
// the number alone.
export function diceText(dice: string, mod: number): string {
  if (!dice) return String(mod).replace('-', '−');
  return dice + (mod > 0 ? '+' + mod : mod < 0 ? '−' + Math.abs(mod) : '');
}
// Average roll of 'NdM' terms (1d8 → 4.5), to compare dice. Anything else counts as 0.
const average = (dice: string) => [...dice.matchAll(/(\d*)d(\d+)/g)].reduce((t, m) => t + (Number(m[1] || 1) * (Number(m[2]) + 1)) / 2, 0);
const abilityName = (a: Ability) => ABILITIES.find(([k]) => k === a)![1];

export type Use = 'melee' | 'thrown' | 'ranged' | 'two-handed';
export interface WeaponAttack {
  itemId: string; name: string; use: Use; econ: Econ; hit: number; hitParts: AcPart[];
  dmg: string; dmgParts: AcPart[]; dtype: string; range: string; props: string; mastery?: string; held: boolean; note?: string;
}

// Proficiency with a weapon (PHB p.12): by category — the class lists' 'Simple weapons', 'Martial weapons' and the Monk's
// and Rogue's partial Martial ones — or by kind, compared as slugs ("Hand Crossbow" = 'hand-crossbow'; a "Longbow +1"
// or a Dagger of Venom counts as its kind, never by its own name).
export function weaponProficient(c: Character, it: Item): boolean {
  const martial = it.wcat === 'martial', light = hasProp(it, 'light'), finesse = hasProp(it, 'finesse');
  const cats: [string, boolean][] = [
    ['Simple weapons', it.wcat === 'simple'], ['Martial weapons', martial],
    ['Martial weapons that have the Light property', martial && light],
    ['Martial weapons that have the Finesse or Light property', martial && (finesse || light)]
  ];
  if (cats.some(([name, ok]) => ok && hasProf(c, 'weapon', name))) return true;
  const kind = weaponKind(it);
  return profList(c).some((p) => p.cat === 'weapon' && slug(p.name) === kind);
}

const attackMode = (use: Use): 'melee' | 'ranged' => (use === 'thrown' || use === 'ranged' ? 'ranged' : 'melee');
// The ability an atkAbil grant offers: 'cast' is the source spell's own casting ability, else the character's.
function overAbility(c: Character, g: Grant): Ability | null {
  if (g.ab !== 'cast') return ABILITIES.some(([k]) => k === g.ab) ? (g.ab as Ability) : null;
  const src = sourceOf(c, g.from) as Spell | null;
  return (g.from.startsWith('spell:') && src?.castAb) || (c.castAb === 'none' ? null : c.castAb);
}
// Active ability overrides (Shillelagh, Martial Arts, Pact of the Blade) that cover this weapon and attack mode.
const overridesFor = (c: Character, it: Item, use: Use) =>
  activeGrants(c, 'atkAbil').filter((g) => (!g.weapons || weaponMatches(it, g.weapons)) && (!g.amode || g.amode === attackMode(use)));

// Strength for melee attacks and Dexterity for ranged ones (PHB p.12); Finesse takes the better (PHB p.213); a thrown
// Melee weapon uses its melee ability (PHB p.214, Thrown). An override says "instead of" (Shillelagh PHB p.316, Martial
// Arts PHB p.101), an option, so the attack takes the better of it and the normal ability; a tie keeps the normal one.
export function weaponAbility(c: Character, it: Item, use: Use): Ability {
  let ab: Ability = use === 'ranged' ? 'dex' : 'str';
  if (hasProp(it, 'finesse') && abilityMod(c, 'dex') > abilityMod(c, 'str')) ab = 'dex';
  for (const g of overridesFor(c, it, use)) {
    const o = overAbility(c, g);
    if (o && abilityMod(c, o) > abilityMod(c, ab)) ab = o;
  }
  return ab;
}

// Dueling's hand rule (PHB p.209): this Melee weapon, not Two-Handed, is the only weapon in hand, held in one hand. A
// Shield is not a weapon, so it doesn't count.
function aloneInOneHand(c: Character, it: Item): boolean {
  const held = weaponsHeld(c);
  return held.length === 1 && held[0].id === it.id && !held[0].two && it.wrange === 'melee' && !twoHanded(it);
}
// An attack or damage bonus grant counts when every filter it has holds: the weapon's type, the attack's mode (thrown
// and ranged uses are ranged attacks), a property, a list of weapons, and Dueling's one hand, never for the
// two-handed use of a Versatile weapon ("in one hand", PHB p.209). Cantrip damage bonuses are for spells.
function grantFits(c: Character, g: Grant, it: Item, use: Use): boolean {
  if (g.cantrip) return false;
  if (g.wrange && g.wrange !== it.wrange) return false;
  if (g.amode && g.amode !== attackMode(use)) return false;
  if (g.prop && !hasProp(it, g.prop)) return false;
  if (g.weapon && !weaponMatches(it, g.weapon)) return false;
  if (g.oneHand && (use === 'two-handed' || !aloneInOneHand(c, it))) return false;
  return true;
}
const grantParts = (c: Character, kind: 'atkBonus' | 'dmgBonus', it: Item, use: Use): AcPart[] =>
  activeGrants(c, kind).filter((g) => grantFits(c, g, it, use)).map((g) => ({ label: g.name, value: num(c, g.val) }));
const sum = (parts: AcPart[]) => parts.reduce((t, p) => t + p.value, 0);

const USE_NOTE: Record<Use, string | undefined> = { melee: undefined, thrown: 'Thrown', ranged: undefined, 'two-handed': 'Two hands' };
function rangeOf(it: Item, use: Use): string {
  if (use === 'thrown') return (it.thrown ?? '') + ' ft';
  if (use === 'ranged') return (it.ammo?.split(';')[0] || it.thrown || '') + ' ft';
  return 'Melee ' + (hasProp(it, 'reach') ? 10 : 5) + ' ft';
}
const isShillelagh = (c: Character, g: Grant) => {
  const src = sourceOf(c, g.from) as Spell | null;
  return !!src && g.from.startsWith('spell:') && (src.cid ? src.cid === 'spell/shillelagh' : normName(src.name) === 'shillelagh');
};

// One attack per use of a weapon. A Melee weapon: melee, plus thrown with Thrown, plus two-handed when Versatile. A
// Ranged weapon: ranged only, with Ammunition or Thrown (a Dart). To-hit = ability modifier + PB if proficient + magic
// bonus + matching attack bonus grants (PHB p.12); damage = the die for the grip (Versatile two hands: its larger die,
// PHB p.214) + the same ability modifier (PHB p.27) + magic bonus + matching damage bonus grants.
export function weaponAttacks(c: Character, it: Item): WeaponAttack[] {
  const uses: Use[] = it.wrange === 'ranged' ? ['ranged']
    : ['melee', ...(hasProp(it, 'thrown') ? ['thrown' as Use] : []), ...(versatile(it) ? ['two-handed' as Use] : [])];
  return uses.map((use) => attackFor(c, it, use).attack);
}

function attackFor(c: Character, it: Item, use: Use): { attack: WeaponAttack; die: string; abilityPart: boolean } {
  const inHand = c.hands.filter((id) => id === it.id).length;
  const pb = profBonus(c.level), ctx = valueCtx(c);
  const ab = weaponAbility(c, it, use), mod = abilityMod(c, ab);
  const magic = it.magic ? [{ label: 'Magic', value: it.magic }] : [];
  const hitParts: AcPart[] = [{ label: abilityName(ab), value: mod }, ...(weaponProficient(c, it) ? [{ label: 'Proficiency Bonus', value: pb }] : []),
    ...magic, ...grantParts(c, 'atkBonus', it, use)].filter((p) => p.value !== 0);
  const dmgParts: AcPart[] = [{ label: abilityName(ab), value: mod }, ...magic, ...grantParts(c, 'dmgBonus', it, use)].filter((p) => p.value !== 0);
  // An override's die (evaluated at the level with valueAt: num would read dice as 0) replaces the grip's die when its
  // average is larger, on either grip: Shillelagh's d12 beats a Quarterstaff's d6 and its two-handed d8.
  let die = (use === 'two-handed' ? it.vers : it.dmg) ?? '';
  const overs = overridesFor(c, it, use);
  for (const g of overs) {
    const d = g.die ? valueAt(g.die, ctx) : 0;
    if (typeof d === 'string' && average(d) > average(die)) die = d;
  }
  // Shillelagh: "Force damage or the weapon's normal damage type (your choice)" (PHB p.316).
  const dtype = overs.some((g) => isShillelagh(c, g)) ? [it.dtype, 'Force'].filter(Boolean).join(' or ') : it.dtype ?? '';
  const held = use === 'two-handed' ? inHand >= 2 : inHand >= 1;
  const attack: WeaponAttack = {
    itemId: it.id, name: it.name, use, econ: 'action', hit: sum(hitParts), hitParts, dmg: diceText(die, sum(dmgParts)), dmgParts, dtype,
    range: rangeOf(it, use), props: it.props ?? '', ...(it.mastery && hasMastery(c, weaponKind(it)) ? { mastery: it.mastery } : {}), held,
    ...(USE_NOTE[use] ? { note: USE_NOTE[use] } : {})
  };
  return { attack, die, abilityPart: mod !== 0 };
}

// Unarmed Strike (PHB p.377): to-hit Strength modifier + PB; damage 1 + Strength modifier, Bludgeoning; Grapple and
// Shove save DC 8 + Strength modifier + PB. An unarmed grant (Martial Arts, PHB p.101) offers its abilities (the best
// one counts, for the DC too) and its die at the level, which replaces the 1 when its grant is the one used; its dtype,
// if any, replaces Bludgeoning (Demon Armor). Attack and damage bonus grants count only when their weapon list names
// 'unarmed-strike'; a range, property or one-hand filter never matches it, a melee attack mode does. A damage total
// below 0 shows 0 (PHB p.27: no negative damage).
export function unarmedStrike(c: Character): WeaponAttack & { dc: number } {
  const ctx = valueCtx(c), pb = profBonus(c.level);
  const grants = activeGrants(c, 'unarmed');
  const abs: Ability[] = ['str', ...grants.flatMap((g) => (g.abs ?? '').split(',').map((a) => a.trim()).filter((a): a is Ability => ABILITIES.some(([k]) => k === a)))];
  const ab = abs.reduce((b, a) => (abilityMod(c, a) > abilityMod(c, b) ? a : b), 'str' as Ability), mod = abilityMod(c, ab);
  let die = '', dtype = 'Bludgeoning';
  for (const g of grants) {
    const d = valueAt(g.die ?? '', ctx);
    if (typeof d === 'string' && average(d) > Math.max(1, average(die))) { die = d; dtype = g.dtype || 'Bludgeoning'; }
  }
  const fits = (g: Grant) => !!g.weapon && g.weapon.split(',').map((x) => x.trim()).includes('unarmed-strike') && !g.wrange && !g.prop && !g.oneHand && g.amode !== 'ranged';
  const bonus = (kind: 'atkBonus' | 'dmgBonus') => activeGrants(c, kind).filter(fits).map((g) => ({ label: g.name, value: num(c, g.val) }));
  const hitParts = [{ label: abilityName(ab), value: mod }, { label: 'Proficiency Bonus', value: pb }, ...bonus('atkBonus')].filter((p) => p.value !== 0);
  const dmgParts = [...(die ? [] : [{ label: 'Unarmed Strike', value: 1 }]), { label: abilityName(ab), value: mod }, ...bonus('dmgBonus')].filter((p) => p.value !== 0);
  const total = sum(dmgParts);
  return {
    itemId: '', name: 'Unarmed Strike', use: 'melee', econ: 'action', hit: sum(hitParts), hitParts,
    dmg: die ? diceText(die, total) : String(Math.max(0, total)), dmgParts, dtype, range: 'Melee 5 ft', props: '', held: true, dc: 8 + mod + pb
  };
}

// Attacks per Attack action: the highest active Extra Attack grant ("attack twice", PHB p.120), else 1. Extra Attack
// from several classes doesn't stack (PHB p.44), so the highest wins.
export const attacksPerAction = (c: Character) => Math.max(1, ...activeGrants(c, 'attacks').map((g) => num(c, g.val)));

// The Light property's extra attack (PHB p.213): only with two Light weapons in hand (two rows, or one row with 2 or
// more held twice: "a different Light weapon" means another weapon, not another kind). It is a Bonus Action and adds no
// ability modifier to damage unless it is negative; Two-Weapon Fighting (a lightExtra grant with addMod, PHB p.210)
// adds it. Nick (PHB p.214): "When you make the extra attack of the Light property, you can make it as part of the
// Attack action". A mastery property applies to attacks with the weapon that has it, so the app reads it as: the extra
// attack's weapon has Nick and the character has its mastery. Either held weapon may make the extra attack, so it is the
// one whose Nick counts when exactly one does (at the table: attack with the Nick weapon second), else the newer one.
export function lightExtra(c: Character): (WeaponAttack & { nick: boolean }) | null {
  const held = weaponsHeld(c);
  if (held.length !== 2 || held.some((w) => w.two)) return null;
  const items = held.map((w) => c.inv.find((i) => i.id === w.id)!);
  if (!items.every((it) => it && hasProp(it, 'light'))) return null;
  const nickOf = (it: Item) => it.mastery === 'nick' && hasMastery(c, weaponKind(it));
  const nicks = items.filter(nickOf);
  const it = nicks.length === 1 ? nicks[0] : items[1];
  const use: Use = it.wrange === 'ranged' ? 'ranged' : 'melee';
  const { attack, die, abilityPart } = attackFor(c, it, use);
  const mod = abilityMod(c, weaponAbility(c, it, use));
  const addMod = activeGrants(c, 'lightExtra').some((g) => g.addMod);
  const dmgParts = abilityPart && mod > 0 && !addMod ? attack.dmgParts.slice(1) : attack.dmgParts;
  const nick = nickOf(it);
  return {
    ...attack, dmgParts, dmg: diceText(die, sum(dmgParts)), econ: nick ? 'action' : 'bonus', nick,
    ...(nick ? { note: 'part of the Attack action, once per turn' } : { note: 'Bonus Action, after the Attack action' })
  };
}

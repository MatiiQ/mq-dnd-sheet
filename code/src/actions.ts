// The Actions tab, computed from the sheet (plan 5): weapon attacks, Unarmed Strike, spells, feature actions and extra
// damage. Pure functions of the character; nothing here is stored.
import { slug, type SpellPart } from './catalog/schema';
import { valueAt } from './catalog/value';
import { hasProp, isWeapon, twoHanded, versatile, weaponKind, weaponMatches, weaponsHeld } from './hands';
import { activeGrants, hasActiveEffect, isActive, isOn, linkOf, sourceLabel, sourceOf } from './links';
import { ABILITIES, abilityMod, charLevel, abilityName, castAbOf, fmt, normName, num, partsTotal, profBonus, profList, hasProf, saveDc, spellAttackFor, spellSaveDcFor, spellUsable, toggleEffect, valueCtx, type AcPart } from './logic';
import type { Ability, Character, Econ, Feature, Grant, Item, Resource, Spell } from './types';

// The "Weapons not held" list: weapons not in hand, equipped first. A weapon inside a container is left out: the player
// takes it out first to wield it (plan 6).
export const otherWeapons = (c: Character): Item[] =>
  c.inv.filter((i) => isWeapon(i) && !i.in && i.qty >= 1 && !c.hands.includes(i.id)).sort((a, b) => Number(b.eq) - Number(a.eq));

// Weapon Mastery: the number of weapon kinds whose mastery properties the character can use, from the active
// prof 'mastery' grants without a target (Fighter 3, 4 from level 4, PHB p.91; Ranger 2 …).
export const masterySlots = (c: Character) =>
  activeGrants(c, 'prof').filter((g) => g.cat === 'mastery' && !g.target).reduce((t, g) => t + num(c, g.val, g), 0);
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

export type Use = 'melee' | 'thrown' | 'ranged' | 'two-handed';
export interface WeaponAttack {
  itemId: string; name: string; use: Use; econ: Econ; hit: number; hitParts: AcPart[];
  dmg: string; dmgParts: AcPart[]; dtype: string; range: string; props: string; mastery?: string; held: boolean; note?: string; crit?: string;
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

// Strength for melee attacks and Dexterity for ranged ones (PHB p.12); Finesse takes the better of the two on any use,
// a ranged Finesse weapon (Dart) included (PHB p.213); a thrown Melee weapon uses its melee ability (PHB p.214, Thrown).
// An override says "instead of" (Shillelagh PHB p.316, Martial Arts PHB p.101), an option, so the attack takes the
// better of it and the normal ability; a tie keeps the normal one.
export function weaponAbility(c: Character, it: Item, use: Use): Ability {
  let ab: Ability = use === 'ranged' ? 'dex' : 'str';
  const other: Ability = ab === 'dex' ? 'str' : 'dex';
  if (hasProp(it, 'finesse') && abilityMod(c, other) > abilityMod(c, ab)) ab = other;
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
// two-handed use of a Versatile weapon ("in one hand", PHB p.209). Cantrip damage bonuses are for spells. useAb: only on an
// attack using that ability (Rage Damage: "an attack using Strength", PHB p.51).
function grantFits(c: Character, g: Grant, it: Item, use: Use, ab: Ability): boolean {
  if (g.cantrip || (g.useAb && g.useAb !== ab)) return false;
  if (g.wrange && g.wrange !== it.wrange) return false;
  if (g.amode && g.amode !== attackMode(use)) return false;
  if (g.prop && !hasProp(it, slug(g.prop))) return false;
  if (g.weapon && !weaponMatches(it, g.weapon)) return false;
  if (g.oneHand && (use === 'two-handed' || !aloneInOneHand(c, it))) return false;
  // onItem: only the weapon the effect was cast on (Magic Weapon, "a nonmagical weapon you touch", PHB p.295).
  if (g.onItem && c.castFx?.[g.from]?.item !== it.id) return false;
  return true;
}
const grantParts = (c: Character, kind: 'atkBonus' | 'dmgBonus', it: Item, use: Use, ab: Ability): AcPart[] =>
  activeGrants(c, kind).filter((g) => grantFits(c, g, it, use, ab)).map((g) => ({ label: g.name, value: num(c, g.val, g) }));

const USE_NOTE: Record<Use, string | undefined> = { melee: undefined, thrown: 'Thrown', ranged: undefined, 'two-handed': 'Two hands' };
function rangeOf(it: Item, use: Use): string {
  if (use === 'thrown') return (it.thrown ?? '') + ' ft';
  if (use === 'ranged') return (it.ammo?.split(';')[0] || it.thrown || '') + ' ft';
  return 'Melee ' + (hasProp(it, 'reach') ? 10 : 5) + ' ft';
}
const isShillelagh = (c: Character, g: Grant) => {
  const src = sourceOf(c, g.from) as Spell | null;
  return !!src && g.from.startsWith('spell:') && spellKey(src) === 'shillelagh';
};

// A wider Critical Hit range, for attacks with weapons and Unarmed Strikes only (Improved Critical 19-20, Superior
// Critical 18-20, PHB p.96): the lowest active grant wins, since each replaces the one before. A 1 always misses
// (PHB p.12), so a value below 2 is ignored. Undefined at the usual 20.
function critText(c: Character): string | undefined {
  const low = Math.min(20, ...activeGrants(c, 'crit').map((g) => num(c, g.val, g)).filter((n) => n >= 2));
  return low < 20 ? `Critical Hit on ${low}–20` : undefined;
}

// One attack per use of a weapon. A Melee weapon: melee, plus thrown with Thrown, plus two-handed when Versatile. A
// Ranged weapon: ranged only, with Ammunition or Thrown (a Dart). To-hit = ability modifier + PB if proficient + magic
// bonus + matching attack bonus grants (PHB p.12); damage = the die for the grip (Versatile two hands: its larger die,
// PHB p.214) + the same ability modifier (PHB p.27) + magic bonus + matching damage bonus grants.
export function weaponAttacks(c: Character, it: Item): WeaponAttack[] {
  const uses: Use[] = it.wrange === 'ranged' ? ['ranged']
    : ['melee', ...(hasProp(it, 'thrown') ? ['thrown' as Use] : []), ...(versatile(it) ? ['two-handed' as Use] : [])];
  return uses.map((use) => attackFor(c, it, use).attack);
}

function attackFor(c: Character, it: Item, use: Use): { attack: WeaponAttack; die: string; mod: number } {
  const inHand = c.hands.filter((id) => id === it.id).length;
  const pb = profBonus(charLevel(c));
  const ab = weaponAbility(c, it, use), mod = abilityMod(c, ab);
  // Loaded magic ammunition adds its own bonus on a ranged use, next to the weapon's (plan 7): the two come from different
  // items and neither text limits the other (SRD 5.2.1 Ammunition, +1, +2, or +3; Ammunition property, PHB p.213).
  const loaded = use === 'ranged' && it.load ? c.inv.find((x) => x.id === it.load)?.magic : undefined;
  const magic = [...(it.magic ? [{ label: 'Magic', value: it.magic }] : []), ...(loaded ? [{ label: 'Ammunition', value: loaded }] : [])];
  const profPart: AcPart = weaponProficient(c, it) ? { label: 'Proficiency Bonus', value: pb } : { label: 'Proficiency Bonus', value: 0, note: 'no training' };
  const hitParts: AcPart[] = [{ label: abilityName(ab), value: mod }, profPart,
    ...magic, ...grantParts(c, 'atkBonus', it, use, ab)].filter((p: AcPart) => p.value !== 0 || p.note);
  const dmgParts: AcPart[] = [{ label: abilityName(ab), value: mod }, ...magic, ...grantParts(c, 'dmgBonus', it, use, ab)].filter((p) => p.value !== 0);
  // An override's die (evaluated at the level with valueAt: num would read dice as 0) replaces the grip's die when its
  // average is larger, on either grip: Shillelagh's d12 beats a Quarterstaff's d6 and its two-handed d8.
  let die = (use === 'two-handed' ? it.vers || it.dmg : it.dmg) ?? '';
  const overs = overridesFor(c, it, use);
  for (const g of overs) {
    const d = g.die ? valueAt(g.die, valueCtx(c, g)) : 0;
    if (typeof d === 'string' && average(d) > average(die)) die = d;
  }
  // Shillelagh: "Force damage or the weapon's normal damage type (your choice)" (PHB p.316).
  const dtype = overs.some((g) => isShillelagh(c, g)) ? [it.dtype, 'Force'].filter(Boolean).join(' or ') : it.dtype ?? '';
  const held = use === 'two-handed' ? inHand >= 2 : inHand >= 1;
  const crit = critText(c);
  const attack: WeaponAttack = {
    itemId: it.id, name: it.name, use, econ: 'action', hit: partsTotal(hitParts), hitParts, dmg: diceText(die, partsTotal(dmgParts)), dmgParts, dtype,
    range: rangeOf(it, use), props: it.props ?? '', ...(it.mastery && hasMastery(c, weaponKind(it)) ? { mastery: it.mastery } : {}), held,
    ...(USE_NOTE[use] ? { note: USE_NOTE[use] } : {}), ...(crit ? { crit } : {})
  };
  return { attack, die, mod };
}

// Unarmed Strike (PHB p.377): to-hit Strength modifier + PB; damage 1 + Strength modifier, Bludgeoning; Grapple and
// Shove save DC 8 + Strength modifier + PB. An unarmed grant (Martial Arts, PHB p.101) offers its abilities (the best
// one counts, for the DC too) and its die at the level, which replaces the 1 when its grant is the one used; its dtype,
// if any, replaces Bludgeoning (Demon Armor). Attack and damage bonus grants count only when their weapon list names
// 'unarmed-strike'; a range, property or one-hand filter never matches it, a melee attack mode does. A damage total
// below 0 shows 0 (PHB p.27: no negative damage).
export function unarmedStrike(c: Character): WeaponAttack & { dc: number } {
  const pb = profBonus(charLevel(c));
  const grants = activeGrants(c, 'unarmed');
  const abs: Ability[] = ['str', ...grants.flatMap((g) => (g.abs ?? '').split(',').map((a) => a.trim()).filter((a): a is Ability => ABILITIES.some(([k]) => k === a)))];
  const ab = abs.reduce((b, a) => (abilityMod(c, a) > abilityMod(c, b) ? a : b), 'str' as Ability), mod = abilityMod(c, ab);
  let die = '', dtype = 'Bludgeoning';
  for (const g of grants) {
    const d = valueAt(g.die ?? '', valueCtx(c, g));
    if (typeof d === 'string' && average(d) > Math.max(1, average(die))) { die = d; dtype = g.dtype || 'Bludgeoning'; }
  }
  const fits = (g: Grant) => !!g.weapon && g.weapon.split(',').map(slug).includes('unarmed-strike') && !g.wrange && !g.prop && !g.oneHand && g.amode !== 'ranged' && (!g.useAb || g.useAb === ab);
  const bonus = (kind: 'atkBonus' | 'dmgBonus') => activeGrants(c, kind).filter(fits).map((g) => ({ label: g.name, value: num(c, g.val, g) }));
  const hitParts = [{ label: abilityName(ab), value: mod }, { label: 'Proficiency Bonus', value: pb }, ...bonus('atkBonus')].filter((p) => p.value !== 0);
  const dmgParts = [...(die ? [] : [{ label: 'Unarmed Strike', value: 1 }]), { label: abilityName(ab), value: mod }, ...bonus('dmgBonus')].filter((p) => p.value !== 0);
  const total = partsTotal(dmgParts), crit = critText(c);
  return {
    ...(crit ? { crit } : {}), itemId: '', name: 'Unarmed Strike', use: 'melee', econ: 'action', hit: partsTotal(hitParts), hitParts,
    dmg: die ? diceText(die, total) : String(Math.max(0, total)), dmgParts, dtype, range: 'Melee 5 ft', props: '', held: true, dc: 8 + mod + pb
  };
}

// Attacks per Attack action: the highest active Extra Attack grant ("attack twice", PHB p.120), else 1. Extra Attack
// from several classes doesn't stack (PHB p.44), so the highest wins.
export const attacksPerAction = (c: Character) => Math.max(1, ...activeGrants(c, 'attacks').map((g) => num(c, g.val, g)));

// The Light property's extra attack (PHB p.213): only with two Light weapons in hand (two rows, or one row with 2 or
// more held twice: "a different Light weapon" means another weapon, not another kind). It is a Bonus Action and adds no
// ability modifier to damage unless it is negative; Two-Weapon Fighting (a lightExtra grant with addMod, PHB p.210)
// adds it. Nick (PHB p.214): "When you make the extra attack of the Light property, you can make it as part of the
// Attack action". A mastery property applies to attacks with the weapon that has it, so the app reads it as: the extra
// attack's weapon has Nick and the character has its mastery. Either held weapon may make the extra attack, so it is the
// one whose Nick counts when exactly one does (at the table: attack with the Nick weapon second), else the newer one.
// Dual Wielder (a lightExtra grant with anyMelee, PHB p.203): one Light weapon is enough, and the extra attack is with the
// other, a Melee weapon without Two-Handed; it has no limit on the Light weapon, so a hand crossbow counts. Crossbow
// Expert (a grant with weapon, PHB p.203): adds the modifier only when the extra attack's weapon matches.
export function lightExtra(c: Character): (WeaponAttack & { nick: boolean }) | null {
  const held = weaponsHeld(c);
  if (held.length !== 2 || held.some((w) => w.two)) return null;
  const items = held.map((w) => c.inv.find((i) => i.id === w.id)!);
  const light = items.filter((it) => it && hasProp(it, 'light'));
  const grants = activeGrants(c, 'lightExtra');
  const nickOf = (it: Item) => it.mastery === 'nick' && hasMastery(c, weaponKind(it));
  let it: Item;
  if (light.length === 2) {
    const nicks = items.filter(nickOf);
    it = nicks.length === 1 ? nicks[0] : items[1];
  } else {
    if (light.length !== 1 || !grants.some((g) => g.anyMelee)) return null;
    it = items.find((x) => x !== light[0])!;
    if (it.wrange !== 'melee' || twoHanded(it)) return null;
  }
  const use: Use = it.wrange === 'ranged' ? 'ranged' : 'melee';
  const { attack, die, mod } = attackFor(c, it, use);
  const addMod = grants.some((g) => g.addMod && (!g.weapon || weaponMatches(it, g.weapon)));
  const dmgParts = mod > 0 && !addMod ? attack.dmgParts.slice(1) : attack.dmgParts;
  const nick = light.length === 2 && nickOf(it);
  return {
    ...attack, dmgParts, dmg: diceText(die, partsTotal(dmgParts)), econ: nick ? 'action' : 'bonus', nick,
    ...(nick ? { note: 'part of the Attack action, once per turn' } : { note: 'Bonus Action, after the Attack action' })
  };
}

// ---------- spells ----------

// The timing of a casting time: Bonus Action before Action, since one starts with the other's word.
export const econOf = (time: string): Econ => {
  const t = time.trim().toLowerCase();
  return t.startsWith('bonus action') ? 'bonus' : t.startsWith('reaction') ? 'reaction' : t.startsWith('action') ? 'action' : 'other';
};
// Spells whose attack takes another action than their casting: Produce Flame is cast as a Bonus Action and hurled with a
// Magic action (PHB p.308). Keyed by catalog slug, with the name as a fallback.
const SPELL_ECON: Record<string, [Econ, string]> = { 'produce-flame': ['action', 'Cast as a Bonus Action; hurl as a Magic action'] };
// Hunter's Mark deals no damage on casting: its damage comes on later hits (PHB p.287), listed under Extra damage.
const EXTRA_NOTE = 'Extra damage on your hits while it lasts', SMITE_NOTE = 'Cast after a hit: the damage comes with that hit';
// Rows that would read as damage on casting: Hunter's Mark (PHB p.287), Crusader's Mantle (p.259), Divine Favor (p.265),
// Fount of Moonlight (p.277), Hex (p.285); and the smites, cast after the hit they add to (Banishing p.245, Blinding
// p.247, Divine p.265, Searing p.314, Shining p.316, Staggering p.320, Thunderous p.334, Wrathful p.343).
const SPELL_NOTES: Record<string, string> = {
  'hunters-mark': EXTRA_NOTE, 'crusaders-mantle': EXTRA_NOTE, 'divine-favor': EXTRA_NOTE, 'fount-of-moonlight': EXTRA_NOTE, hex: EXTRA_NOTE,
  'banishing-smite': SMITE_NOTE, 'blinding-smite': SMITE_NOTE, 'divine-smite': SMITE_NOTE, 'searing-smite': SMITE_NOTE,
  'shining-smite': SMITE_NOTE, 'staggering-smite': SMITE_NOTE, 'thunderous-smite': SMITE_NOTE, 'wrathful-smite': SMITE_NOTE
};
const spellKey = (sp: Spell) => (sp.cid ? sp.cid.split('/').pop()! : slug(sp.name));

// Cantrip dice at the character level: the count × 1, 2, 3 or 4 from levels 1, 5, 11 and 17 ("Cantrip Upgrade", PHB
// p.239; Fire Bolt p.274, Thorn Whip p.333). Only the leading 'NdM' term scales.
const cantripTier = (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1);
export function cantripDice(dice: string, level: number): string {
  const k = cantripTier(level);
  return dice.replace(/^(\d*)d(\d+)/, (_, n: string, m: string) => `${Number(n || 1) * k}d${m}`);
}

export interface SpellAction {
  spellId: string; name: string; group: 'damage' | 'save' | 'healing'; econ: Econ; hit?: number; dc?: number; save?: Ability;
  dice: string; dtype?: string; dtypes?: string; upcast?: string; range: string; source?: string; effect?: boolean; note?: string;
  // part: the index of the spell part this row shows (Ice Knife · Burst); absent on the spell's own row.
  part?: number;
}
// An On/Off effect of the spell: an atkAbil grant from it that counts while its effect is on (Shillelagh).
const effectOf = (c: Character, sp: Spell) => c.grants.some((g) => g.kind === 'atkAbil' && g.from === linkOf('spell', sp.id) && g.when === 'active');
// Cantrip damage bonus grants (Potent Spellcasting) add to cantrips of the class of the grant's source feature, read from
// its catalog id ('feature/druid/…' → druid); a source without one adds nothing. A grant with `spell` adds to that cantrip
// only, whatever its class (Agonizing Blast, PHB p.155).
function cantripBonus(c: Character, sp: Spell): number {
  if (sp.lvl !== 0) return 0;
  const classes = (sp.classes ?? '').split(',');
  return activeGrants(c, 'dmgBonus').filter((g) => {
    if (!g.cantrip) return false;
    if (g.spell) return g.spell === sp.cid;
    const cls = (sourceOf(c, g.from) as Feature | null)?.cid?.split('/')[1];
    return g.from.startsWith('feature:') && !!cls && classes.includes(cls);
  }).reduce((t, g) => t + num(c, g.val, g), 0);
}

// Spells castable now — cantrips always (as in the Spells tab), others when usable (prepared or always prepared) — that
// count now (isActive: a granted spell's level and item conditions), with an attack, a save, damage, healing, or an
// On/Off effect (Shillelagh, shown with its switch and no dice), then one row per part (plan 7). A save puts a row under
// save even when it deals damage (Fireball); otherwise an attack or damage puts it under damage, healing under healing.
export function spellActions(c: Character): SpellAction[] {
  const out: SpellAction[] = [];
  for (const sp of c.spells) {
    if (!(sp.lvl === 0 || spellUsable(c, sp)) || !isActive(c, sp)) continue;
    const effect = effectOf(c, sp);
    const key = spellKey(sp);
    // hasOwn: a spell can be named Constructor.
    const [econ, econNote] = (Object.hasOwn(SPELL_ECON, key) ? SPELL_ECON[key] : undefined) ?? [econOf(sp.time), undefined];
    const note = econNote ?? (Object.hasOwn(SPELL_NOTES, key) ? SPELL_NOTES[key] : undefined);
    const source = sourceLabel(c, sp);
    // Spells without the printed text (the examples) still say which dice a higher slot adds.
    const slotDie = /^(\d+d\d+)\/slot$/.exec(sp.scale ?? '')?.[1];
    const upcast = sp.higher || (slotDie && `+${slotDie} for each slot level above ${sp.lvl}`);
    if (sp.atk || sp.save || sp.fx === 'damage' || sp.fx === 'healing' || effect) {
      out.push({
        ...spellRow(c, sp, { fx: sp.fx, dice: sp.dmg, dtype: sp.dtype, dtypes: sp.dtypes, save: sp.save, atk: sp.atk, dmgMod: sp.dmgMod, healMod: sp.healMod, scale: sp.scale }),
        name: sp.name, econ, ...(upcast ? { upcast } : {}), ...(source ? { source } : {}), ...(effect ? { effect: true } : {}), ...(note ? { note } : {})
      });
    }
    // Each part is its own row with numbers only: no upcast, source, or effect (the spell's own row has them).
    (sp.parts ?? []).forEach((p, i) => out.push({ ...spellRow(c, sp, p), name: `${sp.name} · ${p.label}`, econ, part: i, ...(note ? { note } : {}) }));
  }
  return out;
}
type RowFields = Pick<SpellPart, 'dtype' | 'dtypes' | 'save' | 'atk' | 'dmgMod' | 'healMod' | 'scale'> & { fx?: Spell['fx']; dice?: string };
// The numbers of one row of a spell: the spell's own fields or one part's. Healing that isn't dice (Heal's '70', Power
// Word Heal's 'all HP') shows as it is. Its group: a save puts it under save, an
// attack or damage under damage, healing under healing. To-hit and DC follow the spell's casting ability (PHB p.41).
function spellRow(c: Character, sp: Spell, r: RowFields): Omit<SpellAction, 'name' | 'econ'> {
  const group: SpellAction['group'] = r.save ? 'save' : r.atk || r.fx === 'damage' ? 'damage' : r.fx === 'healing' ? 'healing' : 'damage';
  let dice = r.dice ?? '';
  if (dice && spellKey(sp) === 'eldritch-blast') {
    // Eldritch Blast adds beams instead of dice (PHB p.267).
    const beams = cantripTier(charLevel(c));
    dice = `${beams} ${beams === 1 ? 'beam' : 'beams'} × ${diceText(dice, cantripBonus(c, sp))}`;
  } else if (dice && r.scale === 'cantrip') {
    dice = diceText(cantripDice(dice, charLevel(c)), cantripBonus(c, sp));
  } else if (/\d+d\d+/.test(dice) && ((r.fx === 'healing' && r.healMod) || (r.fx === 'damage' && r.dmgMod))) {
    // Cure Wounds, Healing Word, Mass Cure Wounds: "+ your spellcasting ability modifier" (PHB pp.259, 284, 296);
    // damage that says the same: Spiritual Weapon, Flame Blade (PHB pp.319, 275).
    const ab = castAbOf(c, sp);
    if (ab) dice = `${dice} + ${ab.toUpperCase()} (${fmt(abilityMod(c, ab))})`;
  }
  const hit = r.atk ? spellAttackFor(c, sp) : null, dc = r.save ? spellSaveDcFor(c, sp) : null;
  return {
    spellId: sp.id, group, dice, range: sp.range,
    ...(hit !== null ? { hit } : {}), ...(dc !== null ? { dc } : {}), ...(r.save ? { save: r.save } : {}),
    ...(r.dtype ? { dtype: r.dtype } : {}), ...(r.dtypes ? { dtypes: r.dtypes } : {})
  };
}

// ---------- features and extra damage ----------

// Dice or numbers from a grant, at the level (valueAt: num reads dice as 0), with a real minus.
const valueText = (c: Character, v: string, g?: Grant) => String(valueAt(v, valueCtx(c, g))).replace(/-/g, '−');

// effect: the source's link when the feature has an effect to switch on (Innate Sorcery, Rage); its row shows the switch.
export interface FeatureAction { grantId: string; name: string; econ: Econ; dice?: string; resId?: string; effect?: string; regainTo?: number | 'all'; dc?: number; source?: string; note?: string }
// The counter of the feature with this catalog id (a Domain's option spends the class's Channel Divinity).
export function resOfFeature(c: Character, cid: string): Resource | undefined {
  const f = c.feats.find((x) => x.cid === cid);
  return f && c.res.find((r) => r.from === linkOf('feature', f.id));
}
// Active action grants (Second Wind, Wild Shape, Channel Divinity). `dice` is not always dice: Rage's damage bonus or a
// count evaluates to a number, shown as it comes.
export const featureActions = (c: Character): FeatureAction[] => activeGrants(c, 'action').map((g) => {
  const source = sourceLabel(c, g), resId = g.res ?? (g.uses ? resOfFeature(c, g.uses)?.id : undefined);
  return {
    grantId: g.id, name: g.name, econ: g.econ ?? 'other', ...(g.dice ? { dice: valueText(c, g.dice, g) } : {}), ...(resId ? { resId } : {}),
    ...(g.dc ? { dc: saveDc(c, g) } : {}), ...(g.regainTo ? { regainTo: g.regainTo === 'all' ? 'all' as const : num(c, g.regainTo, g) } : {}),
    ...(source ? { source } : {}), ...(g.note ? { note: g.note } : {}), ...(g.from && hasActiveEffect(c, g.from) ? { effect: g.from } : {})
  };
});
// Switching a feature's effect on from its Actions row spends one use of the row's counter: using the feature is what
// turns it on (Innate Sorcery, PHB p.140). null at 0 uses. Switching off gives nothing back.
export function switchFeatureEffect(c: Character, link: string, resId?: string): Partial<Character> | null {
  if (isOn(c, link)) return toggleEffect(c, link);
  const r = resId ? c.res.find((x) => x.id === resId) : undefined;
  if (r && r.count <= 0) return null;
  const p = toggleEffect(c, link);
  return r ? { ...p, res: c.res.map((x) => (x.id === r.id ? { ...x, count: x.count - 1 } : x)) } : p;
}

export interface ExtraDamage { key: string; name: string; dice: string; dtype?: string; when: string; source?: string; manual?: boolean }
// Extra damage on a hit: active xdmg grants (Sneak Attack's dice at the level, Hunter's Mark while concentrating on
// it), each saying when it applies, then the manual riders as typed. A grant with swap replaces the row it names, and
// shows only with that row on (Foe Slayer's d10 on Hunter's Mark, PHB p.121).
export function extraDamage(c: Character): ExtraDamage[] {
  const all = activeGrants(c, 'xdmg'), base = all.filter((g) => !g.swap);
  const swapped = (name: string) => all.some((g) => g.swap && normName(g.swap) === normName(name));
  const rows = [...base.filter((g) => !swapped(g.name)), ...all.filter((g) => g.swap && base.some((b) => normName(b.name) === normName(g.swap!)))];
  const granted = rows.map((g): ExtraDamage => {
    const source = sourceLabel(c, g);
    return {
      key: 'grant:' + g.id, name: g.name, dice: valueText(c, g.dice ?? '', g), ...(g.dtype ? { dtype: g.dtype } : {}),
      when: [g.on, g.perTurn ? 'once per turn' : ''].filter(Boolean).join(', '), ...(source ? { source } : {})
    };
  });
  return [...granted, ...c.riders.map((r): ExtraDamage => ({ key: 'rider:' + r.id, name: r.name, dice: r.dice, when: '', manual: true }))];
}
export const extraText = (x: ExtraDamage) => (x.dtype ? x.dice + ' ' + x.dtype : x.dice);

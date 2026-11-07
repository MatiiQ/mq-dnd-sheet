// Catalog schema shared by the app and both builders (SRD in the repo, PHB pack on the device). Node runs this
// file directly from the build scripts, so it uses erasable TypeScript only and imports types with `import type`.
import type { AcEffect, Ability, ArmorKind, Size } from '../types';
import { hasDice, isValue } from './value.ts';

export const SRD_VERSION: string = '5.2.1';

export type Kind = 'spell' | 'item' | 'feat' | 'background' | 'species' | 'trait' | 'class' | 'subclass' | 'feature' | 'prof' | 'rule';
export const KINDS: Kind[] = ['spell', 'item', 'feat', 'background', 'species', 'trait', 'class', 'subclass', 'feature', 'prof', 'rule'];

// replace: a pack entry that wins over the SRD entry with its id (merge.ts).
export interface EntryBase { id: string; kind: Kind; name: string; src: 'srd' | 'phb'; desc: string; replace?: boolean }
export interface SpellEntry extends EntryBase {
  kind: 'spell'; lvl: number; school: string; classes: string; time: string; range: string;
  comp: string; dur: string; conc: boolean; ritual: boolean; atk?: 'melee' | 'ranged'; save?: Ability; fx: 'damage' | 'healing' | 'other';
  dice?: string; dtype?: string; scale?: string; higher?: string; acFx?: AcEffect; acVal?: number;
  healMod?: boolean;   // the healing adds the spellcasting ability modifier (Cure Wounds); data only, no rules text
  dmgMod?: boolean;    // the damage adds the spellcasting ability modifier (Spiritual Weapon)
  dtypes?: string;     // a damage type chosen from a list ('Acid,Cold,Fire'); dtype is then left out
  parts?: SpellPart[]; // more damage or healing rows (Ice Knife's burst); the spell's own fields stay the first row
  grants?: Spec[];   // effects while the spell is on (Shillelagh), read when it is added to a character
}
// One more damage or healing row of a spell, named '<spell> · <label>'. It inherits nothing from the spell: every field
// its row needs is written on it. dmgMod/healMod are only ever true.
export interface SpellPart {
  label: string; fx: 'damage' | 'healing'; dice: string; dtype?: string; dtypes?: string; save?: Ability; atk?: 'melee' | 'ranged';
  dmgMod?: boolean; healMod?: boolean; scale?: string;
}
export interface ItemEntry extends EntryBase {
  kind: 'item'; cat: 'weapon' | 'armor' | 'shield' | 'gear' | 'tool' | 'pack' | 'ammo' | 'focus' | 'mount' | 'magic';
  cost?: string; wt?: number;
  wcat?: 'simple' | 'martial'; wrange?: 'melee' | 'ranged'; dmg?: string; dtype?: string; props?: string; thrown?: string; vers?: string; ammo?: string; mastery?: string;
  armor?: ArmorKind; acBase?: number; acBonus?: number; strReq?: number; stealthDis?: boolean;
  cap?: number; capVol?: string; xdim?: boolean;
  rarity?: string; attune?: boolean; charges?: string; recharge?: Recharge4; regain?: string; regainOn?: 'short' | 'dawn';
  // A magic weapon or armor's base item: an item id ('item/dagger', whose weapon or armor fields the SRD builder copies
  // in) or 'armor' / 'weapon' / 'ammo' when the player chooses the base ("any Medium or Heavy armor", Ammunition +1).
  base?: string;
  // baseOf: the bases the player may choose from, a comma list of item ids, when the type line names fewer than "any".
  // Catalog-only: the picker reads it from the entry.
  baseOf?: string;
  magic?: number;      // "+N bonus to attack and damage rolls" (1–3)
  magicPick?: boolean; // the bonus is the player's +1, +2 or +3, asked when added (Weapon, Armor, Shield +N…)
  reads?: Ability;     // a manual or tome: reading it raises this score by 2, to a maximum of 30 (readManual)
  grants?: Spec[];
}
export interface FeatEntry extends EntryBase { kind: 'feat'; cat: 'origin' | 'general' | 'style' | 'boon'; prereq?: string; repeat?: boolean; grants: Spec[] }
// equipA: starting equipment package A as data, a ';' list of 'item/<slug>' ids or plain names, each with an optional
// '*<count>'; gpA/gpB: the coins of package A and of package B (which is coins only). The add flow asks which one.
export interface BackgroundEntry extends EntryBase { kind: 'background'; feat: string; equip: string; equipA?: string; gpA?: number; gpB?: number; grants: Spec[] }
export interface SpeciesEntry extends EntryBase { kind: 'species'; sizes: string; speed: number }
// A species trait or a lineage option. of: the trait an option belongs to (Wood Elf → trait/elf/elven-lineage), which
// offers its options as a choice with the pool 'trait:of=<trait id>'.
export interface TraitEntry extends EntryBase { kind: 'trait'; species: string; lvl: number; of?: string; grants: Spec[] }
// primary: the primary abilities, ',' all of them, '|' any one ('str|dex'), for the multiclass prerequisite (PHB p.44).
// tools: a name list, or a choice over a tool group. multi: what a later class gives (PHB p.44 and each class's
// "As a Multiclass Character"). equipA/gpA/gpB: starting equipment as on a background.
export interface ClassEntry extends EntryBase {
  kind: 'class'; hd: number; saves: string; skills: ChoiceSpec; armor: string; weapons: string; tools?: string | ChoiceSpec;
  castAb?: Ability; slots?: number[][]; pact?: boolean; cantrips?: string; prepared?: string;
  primary?: string; multi?: { armor?: string; weapons?: string; tools?: string | ChoiceSpec; skills?: ChoiceSpec };
  equipA?: string; gpA?: number; gpB?: number;
}
export interface SubclassEntry extends EntryBase { kind: 'subclass'; cls: string }
// again: later levels at which the same feature is gained again, as a comma list ('8,12,16').
// of: an option a pool offers (Eldritch Invocations, Maneuvers, Metamagic), added as its own feature; prereq and repeat as on a feat.
export interface FeatureEntry extends EntryBase { kind: 'feature'; cls: string; sub?: string; lvl: number; again?: string; of?: 'invocation' | 'maneuver' | 'metamagic'; prereq?: string; repeat?: boolean; grants: Spec[] }
export interface ProfEntry extends EntryBase { kind: 'prof'; cat: 'armor' | 'weapon' | 'tool' | 'language' }
export interface RuleEntry extends EntryBase { kind: 'rule'; cat: 'action' | 'sense' | 'condition' | 'property' | 'mastery' }
export type Entry = SpellEntry | ItemEntry | FeatEntry | BackgroundEntry | SpeciesEntry | TraitEntry | ClassEntry | SubclassEntry | FeatureEntry | ProfEntry | RuleEntry;

export type Recharge4 = 'short' | 'long' | 'dawn' | 'none';
export type Spec = GrantSpec | ChoiceSpec;
// Pick N of the options, or of a generated pool ('<kind>:<filter>', such as 'spell:list=druid;lvl=0' or 'skill:any').
// pickAt: a Value that replaces `pick` for the character when the entry is added ('pb', a level table).
// ifPick: '<choiceId>=<value>': asked and used only while that earlier choice of the entry has the value among its picks:
// the option group's label for a choice with options, the picked value for a pool.
export interface ChoiceSpec { kind: 'choice'; id: string; name: string; pick: number; pickAt?: string; orExpert?: boolean; repeat?: boolean; options?: GrantSpec[]; pool?: string; ifPick?: string }
export type GrantKind = 'sense' | 'resource' | 'defense' | 'abil' | 'abilSet' | 'prof' | 'saveBonus' | 'checkBonus' | 'spell' | 'speed' | 'ac'
  | 'init' | 'hpLvl' | 'hpFlat' | 'size' | 'carryUp' | 'action' | 'xdmg' | 'attacks' | 'unarmed' | 'atkBonus' | 'dmgBonus' | 'lightExtra' | 'atkAbil'
  | 'casting' | 'crit' | 'spellAtk' | 'spellDc' | 'checkAdv' | 'aura';
// Every grant is flat, so a character can store it as a plain entry. Fields that take a Value also accept '$<choiceId>'.
export interface GrantSpec {
  id: string; kind: GrantKind; name: string;
  when?: 'armor' | 'noHeavy' | 'noArmor' | 'noShield' | 'noArmorNoShield' | 'active' | 'empty';   // active: while the entry's effect is on (Rage, Starry Form); empty: no weapon in hand and no Shield
  lvl?: number; needEq?: boolean; needAtt?: boolean;
  needAura?: string; needHand?: boolean;                                            // needAura: a feature's catalog id whose aura must be on; needHand: item in hand
  incap?: boolean;                                                                  // aura: ends while Incapacitated (range, note: its size and who it affects)
  opt?: string;                                                                     // in choice options: grants with the same opt are one pick
  range?: string; plus?: boolean;                                                   // sense; plus: adds to another range of the name
  max?: string; recharge?: Recharge4; regain?: string; regainOn?: 'short' | 'dawn'; casts?: string;   // resource
  def?: 'res' | 'vul' | 'imm' | 'adv'; target?: string;                              // defense, prof, checkBonus, checkAdv
  adv?: 'adv' | 'dis';                                                              // checkAdv (also always: counts in passives; note: the situation)
  ab?: string; val?: string; cap?: 20 | 25 | 30;                                         // abil, abilSet, saveBonus, ac, atkAbil
  cat?: 'armor' | 'weapon' | 'tool' | 'language' | 'skill' | 'save' | 'expertise' | 'mastery' | 'half'; orExpert?: boolean;   // prof; orExpert: Expertise if already proficient
  spell?: string; always?: boolean; castAb?: string;                                // spell
  mode?: 'walk' | 'climb' | 'swim' | 'fly' | 'burrow'; hover?: boolean;             // speed
  floor?: boolean;                                                                  // speed: walk Speed at least val
  acMode?: 'bonus' | 'unarmored' | 'dexCap'; shieldOk?: boolean;                    // ac; dexCap: Medium armor's Dexterity cap
  size?: Size;                                                                      // size
  econ?: 'action' | 'bonus' | 'reaction' | 'free' | 'other'; res?: string; note?: string;   // action (also dice)
  uses?: string;                                                                    // action: the feature whose counter it shows (a catalog id); res names one of the entry's own
  regainTo?: string;                                                                // action: tap to regain the counter up to this Value, or 'all'
  dc?: string; dcAb?: string;                                                       // action: a save DC, a Value ('8+pb') plus the best of these abilities (a comma list, or '$<choiceId>')
  atkB?: string;                                                                    // spell (also dc): an item spell's fixed attack bonus and save DC, Values
  chg?: number; chgMax?: number; castLvl?: number;                                  // spell: charges per cast, most charges a cast spends, the level a cast at chg is
  dice?: string; dtype?: string; on?: string; perTurn?: boolean; swap?: string;     // xdmg; swap: the name of an xdmg row this one replaces
  die?: string; abs?: string;                                                       // unarmed (also dtype), atkAbil
  wrange?: 'melee' | 'ranged'; amode?: 'melee' | 'ranged'; prop?: string; weapon?: string; oneHand?: boolean;   // atkBonus, dmgBonus
  onItem?: boolean;                                                                 // atkBonus, dmgBonus: only the weapon the effect was cast on (castFx item)
  cantrip?: boolean;                                                                // dmgBonus: damage of the entry's class cantrips, or with spell, of that one cantrip
  useAb?: string;                                                                   // dmgBonus: only on an attack using this ability (Rage: Strength)
  addMod?: boolean; anyMelee?: boolean;                                             // lightExtra (also weapon: addMod only with these)
  weapons?: string;                                                                 // atkAbil
  list?: string; cantrips?: string; prepared?: string;                              // casting: spell list, counts by level
  s1?: string; s2?: string; s3?: string; s4?: string; s5?: string;                 // casting: slots of each level by class level
}

// Copies of the app's lists (types.ts, logic.ts) so validateEntry has their values at run time; schema.test.ts keeps them in step.
export const ABILITY_KEYS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ARMOR_KINDS: ArmorKind[] = ['light', 'medium', 'heavy', 'shield'];
export const AC_EFFECTS: AcEffect[] = ['bonus', 'base', 'floor'];
// The damage types (PHB p.360-361). The only list: logic.ts re-exports it, the builders build their regex from it.
export const DAMAGE_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'];
export const SIZE_KEYS: Size[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
export const ITEM_CATS: ItemEntry['cat'][] = ['weapon', 'armor', 'shield', 'gear', 'tool', 'pack', 'ammo', 'focus', 'mount', 'magic'];

// PHB names that SRD releases publish under another name, mapped to the SRD name. Both builders apply it. Built from
// scripts/srd/names-diff.ts (SRD 5.2.1 against reference/): only spells named after a person differ.
export const PHB_TO_SRD: Record<string, string> = {
  "Bigby's Hand": 'Arcane Hand', "Drawmij's Instant Summons": 'Instant Summons', "Evard's Black Tentacles": 'Black Tentacles',
  "Leomund's Secret Chest": 'Secret Chest', "Leomund's Tiny Hut": 'Tiny Hut', "Melf's Acid Arrow": 'Acid Arrow',
  "Mordenkainen's Faithful Hound": 'Faithful Hound', "Mordenkainen's Magnificent Mansion": 'Magnificent Mansion',
  "Mordenkainen's Private Sanctum": 'Private Sanctum', "Mordenkainen's Sword": 'Arcane Sword', "Nystul's Magic Aura": 'Arcanist’s Magic Aura',
  "Otiluke's Freezing Sphere": 'Freezing Sphere', "Otiluke's Resilient Sphere": 'Resilient Sphere', "Otto's Irresistible Dance": 'Irresistible Dance',
  "Rary's Telepathic Bond": 'Telepathic Bond', "Tasha's Hideous Laughter": 'Hideous Laughter', "Tenser's Floating Disk": 'Floating Disk'
};

// Lower case, apostrophes dropped, every other run of characters that are not letters or digits becomes '-'.
export const slug = (name: string) => name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const aliasBySlug = () => new Map(Object.entries(PHB_TO_SRD).map(([phb, srd]) => [slug(phb), srd]));
// The one id rule: kind, then the scope (class and subclass for features, class for subclasses, species for traits), then the name.
export function catalogId(kind: Kind, name: string, scope: (string | undefined)[] = []): string {
  const n = (Object.hasOwn(PHB_TO_SRD, name) ? PHB_TO_SRD[name] : undefined) ?? aliasBySlug().get(slug(name)) ?? name;
  return [kind, ...scope.filter((s): s is string => s !== undefined).map(slug), slug(n)].join('/');
}
export function entryScope(e: Entry): (string | undefined)[] {
  return e.kind === 'feature' ? [e.cls, e.sub] : e.kind === 'trait' ? [e.species] : e.kind === 'subclass' ? [e.cls] : [];
}

type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const bool: Check = (v) => typeof v === 'boolean';
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const whole = (lo: number, hi: number): Check => (v) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const ref = (v: unknown) => typeof v === 'string' && /^\$[\w-]+$/.test(v);
const value: Check = (v) => ref(v) || (typeof v === 'string' && isValue(v));
const ability: Check = oneOf(...ABILITY_KEYS);
const or = (...cs: Check[]): Check => (v) => cs.some((c) => c(v));
const list = (c: Check): Check => (v) => typeof v === 'string' && (v === '' || v.split(',').every((x) => c(x)));

const FEATURE_ID: Check = (v) => typeof v === 'string' && /^feature\/[a-z0-9-]+(\/[a-z0-9-]+){1,2}$/.test(v);
const RECHARGE = oneOf('short', 'long', 'dawn', 'none');
const WHEN = oneOf('armor', 'noHeavy', 'noArmor', 'noShield', 'noArmorNoShield', 'active', 'empty');
const RANGE_KIND = oneOf('melee', 'ranged');
// Own fields per grant kind: [check, required].
const GRANTS: Record<GrantKind, Record<string, [Check, boolean]>> = {
  sense: { range: [value, true], plus: [bool, false] },
  resource: { max: [value, false], recharge: [RECHARGE, true], regain: [value, false], regainOn: [oneOf('short', 'dawn'), false], casts: [str, false], note: [str, false] },
  defense: { def: [oneOf('res', 'vul', 'imm', 'adv'), true], target: [str, true] },
  abil: { ab: [or(ability, ref), true], val: [value, true], cap: [oneOf(20, 25, 30), true] },
  abilSet: { ab: [or(ability, ref), true], val: [value, true] },
  prof: { cat: [oneOf('armor', 'weapon', 'tool', 'language', 'skill', 'save', 'expertise', 'mastery', 'half'), true], target: [str, false], orExpert: [bool, false], val: [value, false] },
  saveBonus: { ab: [or(ability, oneOf('all'), ref), true], val: [value, true] },
  checkBonus: { target: [str, true], val: [value, true] },
  // Advantage or Disadvantage on checks of a skill, an ability or all; always: in passive scores, else a note.
  checkAdv: { target: [str, true], adv: [oneOf('adv', 'dis'), true], always: [bool, false], note: [str, false] },
  // An Emanation from you while the grant counts (range: a Value, may be a level table); incap: ends while Incapacitated.
  aura: { range: [value, true], note: [str, false], incap: [bool, false] },
  spell: { spell: [str, true], always: [bool, false], castAb: [or(ability, ref), false], dc: [value, false], atkB: [value, false], chg: [whole(1, 50), false], chgMax: [whole(1, 50), false], castLvl: [whole(1, 9), false] },
  speed: { mode: [oneOf('walk', 'climb', 'swim', 'fly', 'burrow'), true], val: [or(value, oneOf('walk', 'walk2')), true], hover: [bool, false], floor: [bool, false] },
  ac: { acMode: [oneOf('bonus', 'unarmored', 'dexCap'), true], val: [value, false], ab: [or(ability, ref), false], shieldOk: [bool, false] },
  init: { val: [value, true] },
  hpLvl: { val: [value, true] },
  hpFlat: { val: [value, true] },
  size: { size: [oneOf(...SIZE_KEYS), true] },
  carryUp: {},
  action: { econ: [oneOf('action', 'bonus', 'reaction', 'free', 'other'), true], res: [str, false], note: [str, false], dice: [value, false],
    uses: [FEATURE_ID, false], regainTo: [or(value, oneOf('all')), false],
    dc: [value, false], dcAb: [or(list(ability), ref), false] },
  xdmg: { dice: [value, true], dtype: [str, false], on: [str, true], perTurn: [bool, false], swap: [str, false] },
  attacks: { val: [value, true] },
  // dtype: the damage type when not Bludgeoning (Demon Armor: "your unarmed strikes deal 1d8 Slashing").
  unarmed: { die: [value, true], abs: [str, true], dtype: [str, false] },
  atkBonus: { val: [value, true], wrange: [RANGE_KIND, false], amode: [RANGE_KIND, false], prop: [str, false], weapon: [str, false], oneHand: [bool, false], onItem: [bool, false] },
  dmgBonus: { val: [value, true], wrange: [RANGE_KIND, false], amode: [RANGE_KIND, false], prop: [str, false], weapon: [str, false], oneHand: [bool, false], cantrip: [bool, false], useAb: [ability, false], spell: [str, false], onItem: [bool, false] },
  lightExtra: { addMod: [bool, true], anyMelee: [bool, false], weapon: [str, false] },
  atkAbil: { ab: [or(ability, oneOf('cast'), ref), true], weapons: [str, false], amode: [RANGE_KIND, false], die: [value, false] },
  // A subclass that casts from a class list with its own slots (Eldritch Knight, Arcane Trickster).
  casting: { ab: [ability, true], list: [str, true], cantrips: [value, false], prepared: [value, false],
    s1: [value, false], s2: [value, false], s3: [value, false], s4: [value, false], s5: [value, false] },
  // Critical Hit on a d20 roll of val or higher with weapons and Unarmed Strikes.
  crit: { val: [value, true] },
  // A bonus to spell attack rolls, or to the spell save DC (Wand of the War Mage, Robe of the Archmagi).
  spellAtk: { val: [value, true] },
  spellDc: { val: [value, true] }
};
const COMMON: Record<string, [Check, boolean]> = { id: [str, true], kind: [str, true], name: [str, true], when: [WHEN, false], lvl: [whole(1, 20), false], needEq: [bool, false], needAtt: [bool, false],
  needAura: [FEATURE_ID, false], needHand: [bool, false] };

// Per-kind entry fields: [check, required]. Base fields and grants are checked separately.
const SPELL: Record<string, [Check, boolean]> = {
  lvl: [whole(0, 9), true], school: [str, true], classes: [str, true], time: [str, true], range: [str, true], comp: [str, true], dur: [str, true],
  conc: [bool, true], ritual: [bool, true], atk: [RANGE_KIND, false], save: [ability, false], fx: [oneOf('damage', 'healing', 'other'), true],
  dice: [str, false], dtype: [str, false], scale: [str, false], higher: [str, false], acFx: [oneOf(...AC_EFFECTS), false], acVal: [num, false],
  healMod: [oneOf(true), false], dmgMod: [oneOf(true), false], dtypes: [(v) => isDtypes(v), false], parts: [(v) => Array.isArray(v), false]
};
const PART: Record<string, [Check, boolean]> = {
  label: [(v) => typeof v === 'string' && v.trim() !== '', true], fx: [oneOf('damage', 'healing'), true], dice: [str, true],
  dtype: [str, false], dtypes: [(v) => isDtypes(v), false], save: [ability, false], atk: [RANGE_KIND, false],
  dmgMod: [oneOf(true), false], healMod: [oneOf(true), false], scale: [str, false]
};
// What is wrong with one spell part, [] when nothing. Shared with migrate(), which keeps the good parts of a save.
export function partErrors(p: unknown, where = 'part'): string[] {
  if (!isObj(p)) return [`${where} is not an object`];
  const errs: string[] = [];
  for (const k of Object.keys(p)) if (!(k in PART)) errs.push(`${where}: unknown field ${k}`);
  checkFields(p, PART, where, errs);
  if (p.dtype !== undefined && p.dtypes !== undefined) errs.push(`${where}: dtype and dtypes together`);
  return errs;
}
const ITEM: Record<string, [Check, boolean]> = {
  cat: [oneOf(...ITEM_CATS), true], cost: [str, false], wt: [num, false],
  wcat: [oneOf('simple', 'martial'), false], wrange: [RANGE_KIND, false], dmg: [str, false], dtype: [str, false], props: [str, false], thrown: [str, false],
  vers: [str, false], ammo: [str, false], mastery: [str, false],
  armor: [oneOf(...ARMOR_KINDS), false], acBase: [num, false], acBonus: [num, false], strReq: [num, false], stealthDis: [bool, false],
  cap: [num, false], capVol: [str, false], xdim: [bool, false],
  rarity: [str, false], attune: [bool, false], reads: [ability, false], charges: [value, false], recharge: [RECHARGE, false], regain: [value, false], regainOn: [oneOf('short', 'dawn'), false],
  base: [(v) => v === 'armor' || v === 'weapon' || v === 'ammo' || (typeof v === 'string' && /^item\/[a-z0-9-]+$/.test(v)), false],
  baseOf: [(v) => typeof v === 'string' && v.split(',').every((x) => /^item\/[a-z0-9-]+$/.test(x)), false],
  magic: [whole(1, 3), false], magicPick: [oneOf(true), false]
};
// A comma list of two or more damage types, no repeats.
export const isDtypes = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const xs = v.split(',');
  return xs.length >= 2 && new Set(xs).size === xs.length && xs.every((x) => DAMAGE_TYPES.includes(x));
};
const PREREQ_TERM = /^(lvl>=\d+|(str|dex|con|int|wis|cha)(\|(str|dex|con|int|wis|cha))*>=\d+|feature=[a-z0-9-]+(\|[a-z0-9-]+)*|armor=(light|medium|heavy|shield))$/;
const slotRows: Check = (v) => Array.isArray(v) && (v.length === 0 || (v.length === 20 && v.every((r) => Array.isArray(r) && r.length === 9 && r.every(whole(0, 9)))));
const FIELDS: Record<Kind, Record<string, [Check, boolean]>> = {
  spell: SPELL,
  item: ITEM,
  feat: { cat: [oneOf('origin', 'general', 'style', 'boon'), true], prereq: [(v) => typeof v === 'string' && v.split(';').every((t) => PREREQ_TERM.test(t)), false], repeat: [bool, false] },
  background: { feat: [str, true], equip: [str, true], equipA: [str, false], gpA: [whole(0, 99999), false], gpB: [whole(0, 99999), false] },
  species: { sizes: [(v) => typeof v === 'string' && v.split(',').every((s) => SIZE_KEYS.includes(s as Size)), true], speed: [num, true] },
  trait: { species: [str, true], lvl: [whole(1, 20), true], of: [(v) => typeof v === 'string' && v.startsWith('trait/'), false] },
  class: {
    hd: [oneOf(6, 8, 10, 12), true], saves: [list(ability), true], armor: [str, true], weapons: [str, true], tools: [(v) => typeof v === 'string' || (typeof v === 'object' && v !== null && !Array.isArray(v)), false],
    castAb: [ability, false], slots: [slotRows, false], pact: [bool, false], cantrips: [value, false], prepared: [value, false],
    primary: [(v) => typeof v === 'string' && /^(str|dex|con|int|wis|cha)([,|](str|dex|con|int|wis|cha))*$/.test(v) && !(v.includes(',') && v.includes('|')), false],
    multi: [(v) => typeof v === 'object' && v !== null && !Array.isArray(v), false], equipA: [str, false], gpA: [whole(0, 99999), false], gpB: [whole(0, 99999), false]
  },
  subclass: { cls: [str, true] },
  feature: { cls: [str, true], sub: [str, false], lvl: [whole(1, 20), true], again: [str, false], of: [oneOf('invocation', 'maneuver', 'metamagic'), false], prereq: [str, false], repeat: [bool, false] },
  prof: { cat: [oneOf('armor', 'weapon', 'tool', 'language'), true] },
  rule: { cat: [oneOf('action', 'sense', 'condition', 'property', 'mastery'), true] }
};
const HAS_GRANTS: Kind[] = ['feat', 'background', 'trait', 'feature'];

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const primitive = (v: unknown) => v === null || typeof v !== 'object';

function checkFields(o: Record<string, unknown>, fields: Record<string, [Check, boolean]>, where: string, errs: string[]) {
  for (const [k, [check, required]] of Object.entries(fields)) {
    if (o[k] === undefined) { if (required) errs.push(`${where}: missing ${k}`); }
    else if (!check(o[k])) errs.push(`${where}: bad ${k} ${JSON.stringify(o[k])}`);
  }
}
// Recharge pairs: regainOn 'short' goes with recharge 'long', 'dawn' with 'dawn'; regain and regainOn come together.
function checkRegain(o: Record<string, unknown>, where: string, errs: string[]) {
  if ((o.regain === undefined) !== (o.regainOn === undefined)) errs.push(`${where}: regain and regainOn go together`);
  if (o.regainOn !== undefined && !((o.regainOn === 'short' && o.recharge === 'long') || (o.regainOn === 'dawn' && o.recharge === 'dawn'))) {
    errs.push(`${where}: regainOn ${String(o.regainOn)} does not go with recharge ${String(o.recharge)}`);
  }
}

function checkGrant(g: unknown, e: Record<string, unknown>, where: string, errs: string[], inOption = false) {
  if (!isObj(g)) { errs.push(`${where}: not an object`); return; }
  const own = GRANTS[g.kind as GrantKind];
  if (!own) { errs.push(`${where}: unknown grant kind ${JSON.stringify(g.kind)}`); return; }
  const fields = { ...COMMON, ...own, ...(inOption ? { opt: [str, false] as [Check, boolean] } : {}) };
  checkFields(g, fields, where, errs);
  for (const [k, v] of Object.entries(g)) {
    if (!(k in fields)) errs.push(`${where}: unknown field ${k}`);
    if (!primitive(v)) errs.push(`${where}: ${k} is not a plain value`);
  }
  // A spell's lvl is its spell level, not a character level: nothing to compare.
  if (e.kind !== 'spell' && typeof g.lvl === 'number' && typeof e.lvl === 'number' && g.lvl < e.lvl) errs.push(`${where}: lvl ${g.lvl} is below the entry's ${e.lvl}`);
  if ((g.needEq !== undefined || g.needAtt !== undefined || g.needHand !== undefined) && e.kind !== 'item') errs.push(`${where}: needEq/needAtt/needHand are for item grants`);
  if (g.kind === 'resource') checkRegain(g, where, errs);
  if (g.res !== undefined && g.uses !== undefined) errs.push(`${where}: res and uses together`);
  if (g.kind === 'speed' && g.mode === 'walk' && g.val === 'walk') errs.push(`${where}: a walk speed can't equal the walking Speed`);
  if (g.kind === 'spell' && (g.chgMax !== undefined || g.castLvl !== undefined) && g.chg === undefined) errs.push(`${where}: chgMax and castLvl need chg`);
  if (g.kind === 'spell' && typeof g.chg === 'number' && typeof g.chgMax === 'number' && g.chgMax < g.chg) errs.push(`${where}: chgMax below chg`);
  if (g.kind === 'speed' && g.floor && (g.mode !== 'walk' || g.val === 'walk' || g.val === 'walk2')) errs.push(`${where}: a floor is a number of feet on the walking Speed`);
}

function checkChoice(c: Record<string, unknown>, e: Record<string, unknown>, where: string, errs: string[]) {
  checkFields(c, { id: [str, true], name: [str, true], pick: [whole(1, 99), true], pickAt: [value, false], orExpert: [bool, false], repeat: [bool, false], pool: [(v) => typeof v === 'string' && /^[a-z]+:.+$/.test(v), false], ifPick: [str, false] }, where, errs);
  if (c.options === undefined && c.pool === undefined) errs.push(`${where}: needs options or a pool`);
  if (c.options !== undefined) {
    if (!Array.isArray(c.options)) errs.push(`${where}: options is not a list`);
    else c.options.forEach((o, i) => checkGrant(o, e, `${where}.options[${i}]`, errs, true));
  }
}

// The ids of every grant, choice and option in an entry, for uniqueness and for '$<choiceId>' and action `res` references.
function specsOf(e: Record<string, unknown>): Record<string, unknown>[] {
  const top = Array.isArray(e.grants) ? e.grants.filter(isObj) : [];
  return top.flatMap((s) => [s, ...(s.kind === 'choice' && Array.isArray(s.options) ? s.options.filter(isObj) : [])]);
}

// [] when the entry is valid, otherwise one message per problem.
export function validateEntry(x: unknown): string[] {
  if (!isObj(x)) return ['entry is not an object'];
  const errs: string[] = [];
  const at = typeof x.id === 'string' ? x.id : JSON.stringify(x.name);
  if (!KINDS.includes(x.kind as Kind)) return [`${at}: unknown kind ${JSON.stringify(x.kind)}`];
  checkFields(x, { id: [str, true], name: [(v) => typeof v === 'string' && v.trim() !== '', true], src: [oneOf('srd', 'phb'), true],
    desc: [str, true], replace: [bool, false] }, at, errs);
  checkFields(x, FIELDS[x.kind as Kind], at, errs);
  if (errs.length) return errs;
  const e = x as unknown as Entry;
  const want = catalogId(e.kind, e.name, entryScope(e));
  if (e.id !== want) errs.push(`${at}: id should be ${want}`);

  if (e.kind === 'spell' || e.kind === 'item') {
    for (const [k, v] of Object.entries(x)) if (k !== 'grants' && !(k === 'parts' && e.kind === 'spell') && !primitive(v)) errs.push(`${at}: ${k} is not a plain value`);
  }
  if (e.kind === 'spell' && e.parts !== undefined) {
    if (!Array.isArray(e.parts) || !e.parts.length) errs.push(`${at}: parts is not a non-empty list`);
    else {
      e.parts.forEach((p, i) => errs.push(...partErrors(p, `${at}.parts[${i}]`)));
      const labels = e.parts.map((p) => (isObj(p) ? p.label : undefined));
      if (new Set(labels).size !== labels.length) errs.push(`${at}: part labels repeat`);
    }
  }
  if (e.kind === 'spell' && e.dtypes !== undefined && e.dtype !== undefined) errs.push(`${at}: dtype and dtypes together`);
  if (e.kind === 'item') {
    checkRegain(x, at, errs);
    if (e.acBonus !== undefined && !e.armor) errs.push(`${at}: acBonus is for armor and Shields; use an ac grant`);
    if (e.base !== undefined && e.cat !== 'magic') errs.push(`${at}: base is for magic items`);
    if (e.baseOf !== undefined && !['weapon', 'armor', 'ammo'].includes(e.base ?? '')) errs.push(`${at}: baseOf needs a base of the player's choice`);
  }
  if (e.kind === 'feature' && e.again !== undefined) {
    const lv = e.again.split(',').map(Number);
    if (!lv.every((l, i) => Number.isInteger(l) && l > (i ? lv[i - 1] : e.lvl) && l <= 20)) errs.push(`${at}: bad again ${JSON.stringify(e.again)}`);
  }
  if (e.kind === 'background' && e.equipA !== undefined && (e.gpA === undefined || e.gpB === undefined)) errs.push(`${at}: equipA needs gpA and gpB`);
  if (e.kind === 'class') {
    if (e.pact && !e.slots?.length) errs.push(`${at}: pact needs slots`);
    if (e.equipA !== undefined && (e.gpA === undefined || e.gpB === undefined)) errs.push(`${at}: equipA needs gpA and gpB`);
    const choice = (v: unknown, where: string) => {
      if (!isObj(v) || v.kind !== 'choice') errs.push(`${where} is not a choice`);
      else checkChoice(v, x, where, errs);
    };
    if (isObj(e.tools)) choice(e.tools, `${at}.tools`);
    if (isObj(e.multi)) {
      for (const [k, v] of Object.entries(e.multi)) {
        if (k === 'armor' || k === 'weapons') { if (typeof v !== 'string') errs.push(`${at}.multi.${k} is not text`); }
        else if (k === 'tools') { if (typeof v !== 'string') choice(v, `${at}.multi.tools`); }
        else if (k === 'skills') choice(v, `${at}.multi.skills`);
        else errs.push(`${at}.multi: unknown field ${k}`);
      }
    }
    if (!isObj(e.skills) || e.skills.kind !== 'choice') errs.push(`${at}: skills is not a choice`);
    else {
      checkChoice(e.skills as unknown as Record<string, unknown>, x, `${at}.skills`, errs);
      if (!String(e.skills.pool ?? '').startsWith('skill:')) errs.push(`${at}.skills: pool must be a skill: pool`);
    }
  }

  const grants = x.grants;
  if (HAS_GRANTS.includes(e.kind) && grants === undefined) errs.push(`${at}: missing grants`);
  if (grants !== undefined) {
    if (!HAS_GRANTS.includes(e.kind) && e.kind !== 'item' && e.kind !== 'spell') errs.push(`${at}: ${e.kind} entries have no grants`);
    else if (!Array.isArray(grants)) errs.push(`${at}: grants is not a list`);
    else {
      grants.forEach((s, i) => {
        const where = `${at}.grants[${i}]`;
        if (isObj(s) && s.kind === 'choice') checkChoice(s, x, where, errs);
        else checkGrant(s, x, where, errs);
      });
      grants.forEach((s, i) => {
        if (!isObj(s) || s.kind !== 'choice' || s.ifPick === undefined) return;
        const m = /^([\w-]+)=.+$/.exec(String(s.ifPick));
        if (!m || !grants.slice(0, i).some((o) => isObj(o) && o.kind === 'choice' && o.id === m[1])) errs.push(`${at}: ifPick names no earlier choice`);
      });
      const specs = specsOf(x);
      const ids = specs.map((s) => s.id);
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup !== undefined) errs.push(`${at}: grant id ${String(dup)} is used twice`);
      const choices = new Set(grants.filter((s) => isObj(s) && s.kind === 'choice').map((s) => (s as Record<string, unknown>).id));
      for (const s of specs) {
        for (const v of Object.values(s)) if (ref(v) && !choices.has((v as string).slice(1))) errs.push(`${at}: ${String(v)} names no choice`);
        if (s.kind === 'action' && s.res !== undefined && !specs.some((r) => r.kind === 'resource' && r.id === s.res)) errs.push(`${at}: res ${String(s.res)} names no resource`);
      }
    }
  }
  return errs;
}

// checkGrant for one grant stored on a character (Grant in types.ts). The character-only fields go first (checkGrant
// reports every field it doesn't know), minLvl is checked as the spec's lvl, and a '$<choice>' left unresolved fails.
export function grantErrors(g: unknown, from: Kind): string[] {
  if (!isObj(g)) return ['grant: not an object'];
  const { from: _f, srcKind: _k, counted, minLvl, ...spec } = g;
  const errs: string[] = [];
  if (counted !== undefined && typeof counted !== 'boolean') errs.push('grant: bad counted');
  if ('lvl' in spec) errs.push('grant: stores its level as minLvl');
  checkGrant(minLvl === undefined ? spec : { ...spec, lvl: minLvl }, { kind: from }, 'grant', errs);
  for (const [k, v] of Object.entries(spec)) if (ref(v)) errs.push(`grant: ${k} is an unresolved choice`);
  if (spec.kind === 'resource' && typeof spec.max === 'string' && hasDice(spec.max)) errs.push('grant: a maximum can’t be dice');
  return errs;
}

import type { ProfCat } from './catalog/names';
import type { GrantSpec, ItemEntry, SpellPart } from './catalog/schema';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type CastAbility = 'none' | 'int' | 'wis' | 'cha';
export type Recharge = 'none' | 'short' | 'long' | 'dawn';
// A partial regain: on a Short Rest (for a Long Rest counter) or at dawn (for a Dawn counter).
export type RegainOn = 'short' | 'dawn';
export type Tab = 'actions' | 'spells' | 'inventory' | 'features' | 'notes';
export type FeatureGroup = 'class' | 'sub' | 'feat' | 'species' | 'background' | 'training' | 'other';
// When a grant or a granted entry counts: with armor, without Heavy armor, without armor and/or a Shield, while its source's effect is on, or with empty hands.
export type When = 'armor' | 'noHeavy' | 'noArmor' | 'noShield' | 'noArmorNoShield' | 'active' | 'empty';
// adv: Advantage on saving throws ("vs Charmed", "Dexterity saves" or free text).
export type DefenseKind = 'res' | 'vul' | 'imm' | 'adv';
export type SpeedKind = 'climb' | 'swim' | 'fly' | 'burrow';
export type Coin = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
export type NoteKey = 'appearance' | 'personality' | 'backstory' | 'session';
export type ArmorKind = 'light' | 'medium' | 'heavy' | 'shield';
export type AcEffect = 'bonus' | 'base' | 'floor';
export type Unarmored = 'none' | 'barbarian' | 'monk' | 'draconic' | 'dance';
export type SpellSort = 'az' | 'prep' | 'time';
export type Size = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
export type SrcKind = 'species' | 'background' | 'class' | 'subclass' | 'feat' | 'item' | 'spell' | 'other';

// The background is a feature (group 'background'), not a detail. Classes and subclasses are in Character.classes.
export interface Details { name: string; species: string; align: string }
// What an entry came from and when it counts. from: 'feature:<id>' | 'item:<id>' | 'spell:<id>' in this character.
// srcKind + srcName: a source named by hand ("Species · Wood Elf"), kept when a link goes. No srcKind means no kind given.
// minLvl: counts from this character level (never `lvl`, which is the spell level on Spell). needEq / needAtt: the
// source item must be equipped / attuned. linked: the entry was on the sheet before and a grant linked it (removing
// the source unlinks it instead of removing it).
// needAura: the catalog id of the feature whose aura must be active (Aura of Courage rides on Aura of Protection);
// needHand: an item's grant counts only while the item is in hand (Holy Avenger).
export interface Linked { from?: string; srcKind?: SrcKind; srcName?: string; when?: When; minLvl?: number; needEq?: boolean; needAtt?: boolean; linked?: boolean; needAura?: string; needHand?: boolean }
// A grant that is not an entry of its own list: ability, proficiency, speed, AC, initiative, HP per level, size, action
// and the attack kinds. Same flat fields as the catalog's GrantSpec; the spec's `lvl` is stored as `minLvl`, the field
// entries use. counted: "Already counted in my numbers", shown on its source but adding nothing.
export type Grant = Omit<GrantSpec, 'opt' | 'lvl'> & { from: string; srcKind?: SrcKind; counted?: boolean; minLvl?: number };
// A proficiency set by hand (armor, weapon, tool or language). Granted ones are grants (kind 'prof').
export interface Prof { id: string; cat: ProfCat; name: string }
// A resistance, vulnerability, immunity or Advantage on saves. Several with one name show once (mergedDefenses).
export interface Defense extends Linked { id: string; kind: DefenseKind; name: string }
export interface Sense extends Linked { id: string; name: string; range: string; desc?: string; plus?: boolean }
// A counter that refills. No max and no maxV = no maximum; a computed 0 (maxV) is a real maximum of 0. regain: a Value
// (number or die) added on regainOn instead of a full refill.
export interface Counter { count: number; max?: number; maxV?: string; recharge?: Recharge; regain?: string; regainOn?: RegainOn }
// typeName: a custom group name (else the source kind groups it). casts: the id of the spell this resource casts.
export interface Resource extends Linked, Counter { id: string; name: string; note?: string; typeName?: string; casts?: string }
// When an action happens in a turn (plan 5's timing tags): an action, a Bonus Action, a Reaction, free, or other.
export type Econ = 'action' | 'bonus' | 'reaction' | 'free' | 'other';
// A typed (manual) action: its numbers as typed, never recomputed. econ: its timing tag; group: the Actions section it
// shows in ('weapon' = Weapon attacks, else Other).
export interface Attack extends Linked { id: string; name: string; hit: string; dmg: string; info: string; mastery: string; econ?: Econ; group?: 'weapon' | 'other' }
export interface Rider { id: string; name: string; dice: string }
// armor/acBase: a suit of armor or a Shield and its table base. acBonus: a magic or other bonus, counted while equipped.
// wt: weight in lb per unit. cid (here and on spells and features): the catalog id the entry was copied from.
// An item with charges has count (charges left) and the other Counter fields.
// Catalog fields (all optional, all plain values, so a custom item can carry them too): cat and cost; a weapon's
// category, range kind, damage, properties (comma list, alphabetical), thrown range '20/60', versatile die, ammunition
// '150/600;arrow', mastery and magic (+N to attack and damage rolls); armor's Strength requirement and Stealth
// disadvantage; a container's capacity in lb, its volume text and xdim (extradimensional); rarity and attunement.
// base: the catalog's base item id ('item/dagger') of a magic weapon or armor.
// A spell effect's cast state (Character.castFx): the slot level it was cast with, the item it was cast on.
export interface FxState { lvl?: number; item?: string }
export interface Item extends Partial<Counter> {
  id: string; name: string; qty: number; eq: boolean; armor?: ArmorKind; acBase?: number; acBonus?: number; wt?: number; desc?: string; cid?: string;
  cat?: ItemEntry['cat']; cost?: string; wcat?: 'simple' | 'martial'; wrange?: 'melee' | 'ranged'; dmg?: string; dtype?: string; props?: string;
  thrown?: string; vers?: string; ammo?: string; mastery?: string; magic?: number;
  /** A manual or tome not yet read: reading it raises this score (readManual). */
  reads?: Ability;
  strReq?: number; stealthDis?: boolean; cap?: number; capVol?: string; xdim?: boolean; rarity?: string; attune?: boolean; base?: string;
  // sec: the id of the section the player put it in (its kind); none, or one that is gone, = the default list.
  // in: the id of the extradimensional container it sits in (one level deep; it is then never equipped).
  // cp…pp: the coins inside a container (only on a container; fixContainers moves others to the purse).
  sec?: string; in?: string; cp?: number; sp?: number; ep?: number; gp?: number; pp?: number;
  // load: on a weapon with the Ammunition property, the id of the ammunition item in inv it shoots (plan 7; canLoad).
  // Not a form field: an edit keeps it, and normalize() clears it when it no longer fits.
  load?: string;
}
// A section of the item list the player named (Weapons, Armour…), in display order.
// in: the container (an extradimensional item's id) the section sits in; none = the main list.
export interface Section { id: string; name: string; in?: string }
export interface AcMod { id: string; name: string; val: number }
// castAb: this spell's own spellcasting ability (Light Bearer casts with CHA), else the character's.
export interface Spell extends Linked {
  id: string; name: string; lvl: number; time: string; range: string;
  dur?: string; comp?: string; dice?: string;
  c?: boolean; always?: boolean; prep?: boolean;
  // What a linked grant changed, so removing the link can undo it: it turned `always` on; the casting ability before it.
  linkAlways?: true; linkCastAb?: Ability | 'none';
  // acOther: cast on another creature: an AC spell adds no AC, and a ranged or Touch Concentration spell's active effects don't count on you.
  acFx?: AcEffect; acVal?: number; acOther?: true; castAb?: Ability; cid?: string;
  // An item spell's own numbers ("save DC 15"), read before the caster's (spellSaveDcFor, spellAttackFor).
  dc?: number; atkB?: number;
  // Casting from the item's charges: chg per cast, up to chgMax (each charge above chg is one slot level higher), cast at
  // castLvl when the item names a higher level than the spell's own ("Fireball (level 5 version)").
  chg?: number; chgMax?: number; castLvl?: number;
  // Catalog fields: dice stays the free-text summary shown in the row; dmg/dtype are the damage dice and type.
  desc?: string; school?: string; classes?: string; ritual?: boolean; atk?: 'melee' | 'ranged'; save?: Ability;
  fx?: 'damage' | 'healing' | 'other'; dmg?: string; dtype?: string; scale?: string; higher?: string;
  // healMod: the healing adds the spellcasting ability modifier (Cure Wounds), shown on its Actions row; dmgMod the same
  // for damage (Spiritual Weapon). dtypes: a damage type chosen from a list ('Acid,Cold,Fire'), never with dtype.
  healMod?: boolean; dmgMod?: boolean; dtypes?: string;
  // parts: more damage or healing rows of the spell, catalog-only (plan 7); a list, cleaned on load by cleanParts.
  parts?: SpellPart[];
  // cls: the ClassRow id of the class that prepared it (prepared spells count per class, PHB p.45).
  cls?: string;
  // makes: a cast brings a creature (pet) or a form the caster takes (form), tracked as a Companions card.
  // single: a new casting replaces its creature (Find Familiar, Find Steed), so a cast refills the one card.
  makes?: 'pet' | 'form'; single?: boolean;
}
// Hit die sizes (PHB p.45: different dice are tracked separately).
export type Die = 6 | 8 | 10 | 12;
// One class of the character (save v2). The first row is the starting class. id never contains '.' (LevelKey).
// prep: this class's prepared-spell maximum; castAb: its spellcasting ability, once it has Spellcasting or Pact Magic.
export interface ClassRow { id: string; name: string; clsId: string; sub: string; subId: string; lvl: number; hd: Die; prep: number; castAb?: Ability }
// A scalar field a level changed. 'row.<id>.<field>' names a field of a class row. An absent optional value is ''.
export type LevelKey = 'castAb' | 'slotMax' | 'pactMax' | 'pactLvl'
  | `row.${string}.sub` | `row.${string}.subId` | `row.${string}.prep` | `row.${string}.castAb`;
export interface LevelSet { key: LevelKey; was: unknown; now: unknown }
// One level of the history, oldest first. n: the total level reached; cls: the ClassRow id; base: the baseline block
// (no history, cannot be undone). hp.val: the die part only; hp.gain: what the level added to maxHp. added: refs
// ('<RefKind>:<id>') the level added; picks: '<entry ref>/<choice id>' → values; set: scalar fields as was → now.
export interface LevelRecord {
  n: number; cls: string; base?: true;
  hp?: { mode: 'max' | 'fixed' | 'roll'; val: number; gain: number };
  added: string[]; picks: Record<string, string[]>; set: LevelSet[];
}
// makes: the feature makes a creature (Primal Companion) or a form (Wild Shape) without a spell.
export interface Feature extends Linked { id: string; g: FeatureGroup; name: string; desc: string; cid?: string; makes?: 'pet' | 'form' }
// A creature the character commands (pet) or a form the character takes (form), numbers typed by hand.
export interface CreatureAttack { id: string; name: string; hit: string; dmg: string }
// Only the source fields of Linked: when/needEq/needAura… mean nothing on a card. srcName is set while it is linked,
// so a card whose source goes still names it.
export interface Creature extends Pick<Linked, 'from' | 'srcKind' | 'srcName'> {
  id: string; name: string; kind: 'pet' | 'form';
  /** pet: summoned (false = dismissed); form: assumed. */
  on: boolean;
  ac: number;
  /** A form's hp, temp and conds are unused (damage goes to the character); its maxHp is the beast's HP (formTemp 'hp'). */
  hp: number; maxHp: number; temp: number;
  speed: string; init: string; note: string;
  atk: CreatureAttack[];
  conds: Record<string, boolean>;
  /** Off when Concentration on its spell ends (pet or form) / on a Long Rest (pet). */
  ends?: 'conc' | 'long';
  /** The slot level it was summoned at, shown on the card. */
  lvl?: number;
  /** pet: can be sent to a pocket dimension (Find Familiar); away: there now (only while on and pocket). */
  pocket?: boolean; away?: boolean;
  /** form: Temporary HP on assume (wildshape: the Druid level, × 3 for a Moon druid; hp: maxHp). */
  formTemp?: 'wildshape' | 'hp';
  /** form: physical scores. */
  str?: number; dex?: number; con?: number;
}
export interface Concentration { id: string; name: string }
// hdUsed is set only when a spent Hit Die is linked to the change (undoGivesDie), so undoing it refunds that die:
// the die size and that pool's spent count before the die was spent.
export interface HpSnapshot { hp: number; temp: number; ds: number; df: number; conds: Record<string, boolean>; conc: Concentration | null; hdUsed?: { die: Die; used: number } }

export interface Character {
  /** The save format's version (SAVE_VERSION in defaults.ts); migrate() upgrades an older save step by step. */
  v: number;
  ch: Details;
  /** carryUp: counts as one size larger for carrying capacity (Powerful Build). */
  size: Size; carryUp: boolean;
  /** Class rows (save v2), the first is the starting class; the character level is their sum (totalLevel). */
  classes: ClassRow[];
  /** Level history, oldest first; base records are the baseline (no history). */
  levels: LevelRecord[];
  /** The CON modifier already counted inside maxHp and origHp; maxHpOf adds level × (CON mod − conBase). */
  conBase: number;
  speedBase: number; speeds: Record<SpeedKind, number>; speedOpen: boolean;
  initMisc: number; castAb: CastAbility;
  /** AC spells switched on (ids of non-Concentration spells with an AC effect), unarmored feature, custom bonuses. */
  acOpen: boolean; acUnarm: Unarmored; acOn: string[]; acMods: AcMod[];
  abil: Record<Ability, number>; abilAdj: Partial<Record<Ability, number>>;
  saveProf: Partial<Record<Ability, boolean>>; skillProf: Record<string, number>;
  hp: number; maxHp: number; origHp: number; origOn: boolean; temp: number; amount: number;
  /** Inspiration: the table's counter, 0 or more. */
  insp: number;
  // inspOn: the Inspiration counter is shown (Edit mode switch); off hides it and its pill, keeping insp.
  inspOn: boolean;
  /** Top bar pills, 3 slots: a stat key, 'res:<resource id>', or '' for an empty slot. */
  pills: string[];
  tab: Tab; spellFilter: 'all' | 'prepared'; spellSort: SpellSort; usePrep: boolean;
  /** Spent Hit Dice per die size (PHB p.45: different dice are tracked separately). */
  hdUsed: Partial<Record<Die, number>>;
  /** The die size of a Hit Die just spent whose heal hasn't run yet (never loaded: migrate() drops it). */
  hdLast?: Die;
  ds: number; df: number; exh: number;
  conds: Record<string, boolean>; conc: Concentration | null;
  hpUndo: { prev: HpSnapshot; post?: HpSnapshot; text: string } | null; concCheck: string | null; restMsg: { title: string; body: string } | null;
  slotMax: number[]; slotUsed: number[];
  // Pact Magic's own pool (PHB p.45): slot count, slot level, spent; refilled by a Short Rest too.
  pactMax: number; pactLvl: number; pactUsed: number;
  defenses: Defense[];
  senses: Sense[]; res: Resource[]; attacks: Attack[]; riders: Rider[];
  /** Attunement slots: 3 item ids, '' for an empty slot. */
  coins: Record<Coin, number>; attuneIds: string[]; notes: Record<NoteKey, string>;
  inv: Item[]; spells: Spell[]; feats: Feature[];
  /** Item sections, in display order (plan 6). Items name theirs in `sec`. */
  sections: Section[];
  grants: Grant[]; profs: Prof[];
  /** Effects switched on: 'feature:<id>', 'item:<id>' or a non-Concentration 'spell:<id>' (a Concentration spell's is on through conc). */
  effectsOn: string[];
  /** Cast state per effect source ('spell:<id>'): the slot level, the item it is on. Optional and absent by default:
   *  frozen saves have no such key. Kept by normalize() only while the effect is on. */
  castFx?: Record<string, FxState>;
  /** The rolled Initiative total of the current combat (optional, absent by default): 1–99, cleared by a rest. */
  initRoll?: number;
  /** Companions and forms (optional, absent by default: frozen saves have no such key). */
  creatures?: Creature[];
  /** Weapons in hand: item ids, oldest first, one entry per hand (a Two-Handed weapon or a Versatile one in two hands twice). Changed only through setHands (hands.ts). */
  hands: string[];
  /** Weapon kinds (weaponKind slugs) chosen for Weapon Mastery, oldest first; picks past the slot count don't count. */
  mastery: string[];
}

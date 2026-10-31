import type { ProfCat } from './catalog/names';
import type { GrantSpec } from './catalog/schema';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type CastAbility = 'none' | 'int' | 'wis' | 'cha';
export type Recharge = 'none' | 'short' | 'long' | 'dawn';
// A partial regain: on a Short Rest (for a Long Rest counter) or at dawn (for a Dawn counter).
export type RegainOn = 'short' | 'dawn';
export type Tab = 'actions' | 'spells' | 'inventory' | 'features' | 'notes';
export type FeatureGroup = 'class' | 'sub' | 'feat' | 'species' | 'background' | 'training' | 'other';
// When a grant or a granted entry counts: with armor, without Heavy armor, without armor and/or a Shield, or while its source's effect is on.
export type When = 'armor' | 'noHeavy' | 'noArmor' | 'noShield' | 'noArmorNoShield' | 'active';
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

export interface Details { name: string; species: string; cls: string; sub: string; bg: string; align: string }
// What an entry came from and when it counts. from: 'feature:<id>' | 'item:<id>' | 'spell:<id>' in this character.
// srcKind + srcName: a source named by hand ("Species · Wood Elf"), kept when a link goes. No srcKind means no kind given.
// minLvl: counts from this character level (never `lvl`, which is the spell level on Spell). needEq / needAtt: the
// source item must be equipped / attuned.
export interface Linked { from?: string; srcKind?: SrcKind; srcName?: string; when?: When; minLvl?: number; needEq?: boolean; needAtt?: boolean }
// A grant that is not an entry of its own list: ability, proficiency, speed, AC, initiative, HP per level, size, action
// and the attack kinds. Same flat fields as the catalog's GrantSpec; the spec's `lvl` is stored as `minLvl`, the field
// entries use. counted: "Already counted in my numbers", shown on its source but adding nothing.
export type Grant = Omit<GrantSpec, 'opt' | 'lvl'> & { from: string; srcKind?: SrcKind; counted?: boolean; minLvl?: number };
// A proficiency set by hand (armor, weapon, tool or language). Granted ones are grants (kind 'prof').
export interface Prof { id: string; cat: ProfCat; name: string }
// A resistance, vulnerability, immunity or Advantage on saves. Several with one name show once (mergedDefenses).
export interface Defense extends Linked { id: string; kind: DefenseKind; name: string }
export interface Sense extends Linked { id: string; name: string; range: string; desc?: string }
// A counter that refills. No max and no maxV = no maximum; a computed 0 (maxV) is a real maximum of 0. regain: a Value
// (number or die) added on regainOn instead of a full refill.
export interface Counter { count: number; max?: number; maxV?: string; recharge?: Recharge; regain?: string; regainOn?: RegainOn }
// typeName: a custom group name (else the source kind groups it). casts: the id of the spell this resource casts.
// inv: legacy "Also list in Inventory" flag, kept only on resources with a max or a recharge (plan 3 moves them onto items).
export interface Resource extends Linked, Counter { id: string; name: string; note?: string; typeName?: string; casts?: string; inv?: boolean }
export interface Attack extends Linked { id: string; name: string; hit: string; dmg: string; info: string; mastery: string }
export interface Rider { id: string; name: string; dice: string }
// armor/acBase: a suit of armor or a Shield and its table base. acBonus: a magic or other bonus, counted while equipped.
// wt: weight in lb per unit. cid (here and on spells and features): the catalog id the entry was copied from.
export interface Item { id: string; name: string; qty: number; eq: boolean; armor?: ArmorKind; acBase?: number; acBonus?: number; wt?: number; desc?: string; cid?: string }
export interface AcMod { id: string; name: string; val: number }
// castAb: this spell's own spellcasting ability (Light Bearer casts with CHA), else the character's.
export interface Spell extends Linked {
  id: string; name: string; lvl: number; time: string; range: string;
  dur?: string; comp?: string; dice?: string;
  c?: boolean; always?: boolean; prep?: boolean; free?: boolean;
  acFx?: AcEffect; acVal?: number; castAb?: Ability; cid?: string;
}
export interface Feature extends Linked { id: string; g: FeatureGroup; name: string; desc: string; cid?: string }
export interface Concentration { id: string; name: string }
// hdUsed is set only by a Hit Die heal, so undoing it refunds the die.
export interface HpSnapshot { hp: number; temp: number; ds: number; df: number; conds: Record<string, boolean>; conc: Concentration | null; hdUsed?: number }

export interface Character {
  ch: Details;
  /** carryUp: counts as one size larger for carrying capacity (Powerful Build). */
  size: Size; carryUp: boolean;
  level: number; speedBase: number; speeds: Record<SpeedKind, number>; speedOpen: boolean;
  initMisc: number; hdDie: number; castAb: CastAbility;
  /** AC spells switched on (ids of non-Concentration spells with an AC effect), unarmored feature, custom bonuses. */
  acOpen: boolean; acUnarm: Unarmored; acOn: string[]; acMods: AcMod[];
  abil: Record<Ability, number>; abilAdj: Partial<Record<Ability, number>>;
  saveProf: Partial<Record<Ability, boolean>>; skillProf: Record<string, number>;
  hp: number; maxHp: number; origHp: number; origOn: boolean; temp: number; amount: number;
  /** Inspiration: the table's counter, 0 or more. */
  insp: number;
  /** Top bar pills, 3 slots: a stat key, 'res:<resource id>', or '' for an empty slot. */
  pills: string[];
  tab: Tab; prepMax: number; spellFilter: 'all' | 'prepared'; spellSort: SpellSort; usePrep: boolean;
  hdUsed: number; ds: number; df: number; exh: number;
  conds: Record<string, boolean>; free: Record<string, boolean>; conc: Concentration | null;
  hpUndo: { prev: HpSnapshot; text: string } | null; concCheck: string | null; restMsg: { title: string; body: string } | null;
  slotMax: number[]; slotUsed: number[];
  defenses: Defense[];
  senses: Sense[]; res: Resource[]; attacks: Attack[]; riders: Rider[];
  /** Attunement slots: 3 item ids, '' for an empty slot. */
  coins: Record<Coin, number>; attuneIds: string[]; notes: Record<NoteKey, string>;
  inv: Item[]; spells: Spell[]; feats: Feature[];
  grants: Grant[]; profs: Prof[];
  /** Effects switched on: 'feature:<id>', 'item:<id>' or a non-Concentration 'spell:<id>' (a Concentration spell's is on through conc). */
  effectsOn: string[];
}

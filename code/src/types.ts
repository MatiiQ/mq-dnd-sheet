export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type CastAbility = 'none' | 'int' | 'wis' | 'cha';
export type Recharge = 'none' | 'short' | 'long';
export type Tab = 'actions' | 'spells' | 'inventory' | 'features' | 'notes';
export type FeatureGroup = 'class' | 'sub' | 'feat' | 'species' | 'training' | 'other';
export type DefenseKind = 'res' | 'vul' | 'imm';
export type SpeedKind = 'climb' | 'swim' | 'fly' | 'burrow';
export type Coin = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
export type NoteKey = 'appearance' | 'personality' | 'backstory' | 'session';
export type ArmorKind = 'light' | 'medium' | 'heavy' | 'shield';
export type AcEffect = 'bonus' | 'base' | 'floor';
export type Unarmored = 'none' | 'barbarian' | 'monk' | 'draconic' | 'dance';

export interface Details { name: string; species: string; cls: string; sub: string; bg: string; align: string }
export interface Sense { id: string; name: string; range: string }
export interface Resource { id: string; name: string; note?: string; count: number; max?: number; recharge?: Recharge; refill?: boolean; inv?: boolean }
export interface Attack { id: string; name: string; hit: string; dmg: string; info: string; mastery: string }
export interface Rider { id: string; name: string; dice: string }
// armor/acBase: a suit of armor or a Shield and its table base. acBonus: a magic or other bonus, counted while equipped.
export interface Item { id: string; name: string; qty: number; eq: boolean; armor?: ArmorKind; acBase?: number; acBonus?: number }
export interface AcMod { id: string; name: string; val: number }
export interface Spell {
  id: string; name: string; lvl: number; time: string; range: string; source: string;
  dur?: string; comp?: string; dice?: string;
  c?: boolean; always?: boolean; prep?: boolean; free?: boolean;
  acFx?: AcEffect; acVal?: number;
}
export interface Feature { id: string; g: FeatureGroup; name: string; desc: string }
export interface Concentration { id: string; name: string }
// hdUsed is set only by a Hit Die heal, so undoing it refunds the die.
export interface HpSnapshot { hp: number; temp: number; ds: number; df: number; conds: Record<string, boolean>; conc: Concentration | null; hdUsed?: number }

export interface Character {
  ch: Details;
  level: number; speedBase: number; speeds: Record<SpeedKind, number>; speedOpen: boolean;
  initMisc: number; hdDie: number; castAb: CastAbility;
  /** AC spells switched on (ids of non-Concentration spells with an AC effect), unarmored feature, custom bonuses. */
  acOpen: boolean; acUnarm: Unarmored; acOn: string[]; acMods: AcMod[];
  abil: Record<Ability, number>; abilAdj: Partial<Record<Ability, number>>;
  saveProf: Partial<Record<Ability, boolean>>; skillProf: Record<string, number>;
  hp: number; maxHp: number; origHp: number; origOn: boolean; temp: number; amount: number; insp: boolean;
  /** Top bar pills, 3 slots: a stat key, 'res:<resource id>', or '' for an empty slot. */
  pills: string[];
  tab: Tab; prepMax: number; spellFilter: 'all' | 'prepared'; usePrep: boolean;
  hdUsed: number; ds: number; df: number; exh: number;
  conds: Record<string, boolean>; free: Record<string, boolean>; conc: Concentration | null;
  hpUndo: { prev: HpSnapshot; text: string } | null; concCheck: string | null; restMsg: { title: string; body: string } | null;
  slotMax: number[]; slotUsed: number[];
  def: Record<DefenseKind, string[]>; saveNotes: string;
  senses: Sense[]; res: Resource[]; attacks: Attack[]; riders: Rider[];
  coins: Record<Coin, number>; attune: string[]; notes: Record<NoteKey, string>;
  inv: Item[]; spells: Spell[]; feats: Feature[];
}

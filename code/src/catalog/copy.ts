// Copying catalog entries onto a character, and the custom forms that build the same fields by hand. Pure functions:
// the pickers and forms call them, then save through update().
import { maxFields, parseWeight } from '../logic';
import type { ArmorKind, Item, Recharge, Spell } from '../types';
import { slug, type ItemEntry, type SpellEntry } from './schema';

// Drops undefined values and empty strings, so a copied entry holds only what the catalog has.
const compact = <T extends object>(x: T): T =>
  Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '')) as T;
const ABBR: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

// The row summary of a catalog spell: '8d6 Fire · DEX save', '1d10 Fire · ranged attack', '2d8 healing', '' for none.
export function spellSummary(e: SpellEntry): string {
  if (e.fx === 'other' || !e.dice) return '';
  if (e.fx === 'healing') return e.dice + ' healing';
  const dmg = [e.dice, e.dtype].filter(Boolean).join(' ');
  const how = e.save ? ABBR[e.save] + ' save' : e.atk ? e.atk + ' attack' : '';
  return [dmg, how].filter(Boolean).join(' · ');
}

// A catalog spell as a character's spell, prepared. A cantrip gets prep too: migrate() marks a spell with neither prep
// nor always as prepared, so leaving it unset would change the save on its next load. The entry's grants are not
// copied here (addFromCatalog adds them, linked to the new spell).
export function spellFromEntry(e: SpellEntry): Omit<Spell, 'id'> {
  return compact({
    name: e.name, lvl: e.lvl, time: e.time, range: e.range, dur: e.dur, comp: e.comp, cid: e.id, c: e.conc, ritual: e.ritual,
    school: e.school, classes: e.classes, desc: e.desc, atk: e.atk, save: e.save, fx: e.fx, dmg: e.dice, dtype: e.dtype, scale: e.scale,
    higher: e.higher, acFx: e.acFx, acVal: e.acVal, prep: true, dice: spellSummary(e)
  });
}

const ITEM_COPY = ['cost', 'wt', 'wcat', 'wrange', 'dmg', 'dtype', 'props', 'thrown', 'vers', 'ammo', 'mastery', 'armor', 'acBase', 'acBonus',
  'strReq', 'stealthDis', 'cap', 'capVol', 'xdim', 'rarity', 'attune'] as const;
// A catalog item as a character's item: one, not equipped. Charges: a whole number fills count and max; a formula
// ('pb') is maxV with count 0 (addFromCatalog fills it to the maximum). `base` is copied only as an item id, never
// the generic 'armor'/'weapon'. Grants are not copied here (addFromCatalog adds them, linked to the new item).
export function itemFromEntry(e: ItemEntry): Omit<Item, 'id'> {
  const out: Record<string, unknown> = { name: e.name, qty: 1, eq: false, cat: e.cat, desc: e.desc, cid: e.id };
  for (const k of ITEM_COPY) out[k] = e[k];
  if (e.base?.startsWith('item/')) out.base = e.base;
  if (e.charges !== undefined) {
    if (/^\d+$/.test(e.charges)) Object.assign(out, { count: Number(e.charges), max: Number(e.charges) });
    else Object.assign(out, { count: 0, maxV: e.charges });
    Object.assign(out, { recharge: e.recharge, regain: e.regain, regainOn: e.regainOn });
  }
  return compact(out) as Omit<Item, 'id'>;
}

export type ItemKind = 'none' | 'weapon' | 'armor' | 'container';
// The weapon properties in the form's order; the catalog stores them alphabetically.
export const WEAPON_PROPS = ['finesse', 'light', 'thrown', 'versatile', 'ammunition', 'loading', 'reach', 'two-handed', 'heavy'] as const;
export type WeaponProp = (typeof WEAPON_PROPS)[number];
// The custom item form as typed: text for numbers, so an empty field means "not set". Catalog-only fields (cat, cost,
// rarity, cid, base) have no input; the draft carries them so an edit keeps them.
export interface ItemDraft {
  kind: ItemKind; name: string; desc: string; wt: string; qty: number; attune: boolean;
  wcat: 'simple' | 'martial'; wrange: 'melee' | 'ranged'; dmg: string; dtype: string; props: WeaponProp[];
  thrownRange: string; versDie: string; ammoRange: string; ammoType: string; mastery: string; magic: string;
  armor: ArmorKind; acBase: string; acBonus: string; strReq: string; stealthDis: boolean;
  xdim: boolean; cap: string; capVol: string;
  charges: boolean; chMaxKind: 'none' | 'number' | 'formula'; chMaxText: string; chCount: number; chRecharge: Recharge; chRegain: string;
  cat: ItemEntry['cat']; cost?: string; rarity?: string; cid?: string; base?: string;
}
export const BLANK_ITEM: ItemDraft = {
  kind: 'none', name: '', desc: '', wt: '', qty: 1, attune: false,
  wcat: 'simple', wrange: 'melee', dmg: '', dtype: '', props: [], thrownRange: '', versDie: '', ammoRange: '', ammoType: '', mastery: '', magic: '',
  armor: 'light', acBase: '', acBonus: '', strReq: '', stealthDis: false,
  xdim: false, cap: '', capVol: '',
  charges: false, chMaxKind: 'none', chMaxText: '', chCount: 0, chRecharge: 'dawn', chRegain: '',
  cat: 'gear'
};

// The catalog category for the form's kind. The kind switch sets the draft's cat with it; itemFromForm never does.
export function catForKind(kind: ItemKind, armor?: ArmorKind): ItemEntry['cat'] {
  return kind === 'weapon' ? 'weapon' : kind === 'armor' ? (armor === 'shield' ? 'shield' : 'armor') : 'gear';
}

const text = (s: string) => s.trim() || undefined;
const number = (s: string) => { const t = s.trim(); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : undefined; };
// Zero means "none" for a bonus or requirement.
const nonZero = (s: string) => number(s) || undefined;

// The custom item form's draft as an item. Every key the form owns is present, undefined when empty or when it belongs
// to another kind, so saveEntry's merge clears it on an edit. `eq` is not form-owned and never written (the save
// handler passes { eq: false } as saveEntry's extra on add).
export function itemFromForm(d: ItemDraft): Omit<Item, 'id' | 'eq'> {
  const w = d.kind === 'weapon', a = d.kind === 'armor', box = d.kind === 'container';
  const props = w ? [...d.props].sort() : [];
  const has = (p: WeaponProp) => props.includes(p);
  const range = text(d.ammoRange);
  const regainOn = d.chRecharge === 'long' ? 'short' as const : d.chRecharge === 'dawn' ? 'dawn' as const : undefined;
  const regain = d.charges && regainOn ? text(d.chRegain) : undefined;
  const max = (d.charges && maxFields(d.chMaxKind, d.chMaxText)) || {};
  return {
    name: d.name.trim(), qty: d.qty, desc: text(d.desc), wt: parseWeight(d.wt), attune: d.attune || undefined,
    cat: d.cat, cost: d.cost, rarity: d.rarity, cid: d.cid, base: d.base,
    wcat: w ? d.wcat : undefined, wrange: w ? d.wrange : undefined, dmg: w ? text(d.dmg) : undefined, dtype: w ? text(d.dtype) : undefined,
    props: props.length ? props.join(',') : undefined,
    thrown: has('thrown') ? text(d.thrownRange) : undefined,
    vers: has('versatile') ? text(d.versDie) : undefined,
    ammo: has('ammunition') && range ? `${range};${slug(d.ammoType)}` : undefined,
    mastery: w ? text(d.mastery) : undefined, magic: w ? nonZero(d.magic) : undefined,
    armor: a ? d.armor : undefined, acBase: a ? number(d.acBase) : undefined, acBonus: a ? nonZero(d.acBonus) : undefined,
    strReq: a ? nonZero(d.strReq) : undefined, stealthDis: (a && d.stealthDis) || undefined,
    xdim: (box && d.xdim) || undefined, cap: box ? number(d.cap) : undefined, capVol: box ? text(d.capVol) : undefined,
    count: d.charges ? d.chCount : undefined, max: max.max, maxV: max.maxV, recharge: d.charges ? d.chRecharge : undefined,
    regain, regainOn: regain ? regainOn : undefined
  };
}

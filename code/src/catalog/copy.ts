// Copying catalog entries onto a character, and the custom forms that build the same fields by hand. Pure functions:
// the pickers and forms call them, then save through update().
import { linkOf, srcKindOfLink } from '../links';
import { ABILITIES, addGrants, capital, detectArmor, effScore, hasProf, maxFields, maxKindOf, maxOf, newId, normName, num, parseWeight, regainEvent, SKILLS, skillLevel, type GrantInput, type MaxKind } from '../logic';
import type { AcEffect, Ability, ArmorKind, Character, Feature, FeatureGroup, Item, Linked, Recharge, Size, Spell, SrcKind } from '../types';
import { entriesOf, type Catalog } from './merge';
import { slug, type ChoiceSpec, type Entry, type FeatEntry, type FeatureEntry, type GrantSpec, type ItemEntry, type ProfEntry, type RuleEntry, type SpellEntry, type SpellPart, type TraitEntry } from './schema';
import { withBase } from './base';
import { diceRange } from './value';

// Drops undefined values and empty strings, so a copied entry holds only what the catalog has.
const compact = <T extends object>(x: T): T =>
  Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '')) as T;

// The damage type a row shows: the type, or a chosen one's list as 'Acid/Cold/Fire'.
export const dtypeText = (x: { dtype?: string; dtypes?: string }) => x.dtype || x.dtypes?.split(',').join('/') || '';
// One row's summary: '8d6 Fire · DEX save', '1d10 Fire · ranged attack', '2d8 healing', '' for none.
function rowSummary(e: Pick<SpellEntry, 'fx' | 'dice' | 'dtype' | 'dtypes' | 'save' | 'atk'>): string {
  if (e.fx === 'other' || !e.dice) return '';
  // Fixed healing that isn't dice (Heal's 70, Power Word Heal's all HP) reads as an amount.
  if (e.fx === 'healing') return /\d+d\d+/.test(e.dice) ? e.dice + ' healing' : `heals ${e.dice.replace(/ HP$/, '')} HP`;
  const dmg = [e.dice, dtypeText(e)].filter(Boolean).join(' ');
  const how = e.save ? e.save.toUpperCase() + ' save' : e.atk ? e.atk + ' attack' : '';
  return [dmg, how].filter(Boolean).join(' · ');
}
// The row summary of a catalog spell: its own row's, then each part's after '; ' as '<label>: <summary>'
// ('1d10 Piercing · ranged attack; Burst: 2d6 Cold · DEX save').
export function spellSummary(e: SpellEntry): string {
  return [rowSummary(e), ...(e.parts ?? []).map((p) => `${p.label}: ${rowSummary(p)}`)].filter(Boolean).join('; ');
}

// A catalog spell as a character's spell, prepared. A cantrip gets prep too: migrate() marks a spell with neither prep
// nor always as prepared, so leaving it unset would change the save on its next load. The entry's grants are not
// copied here (addFromCatalog adds them, linked to the new spell).
export function spellFromEntry(e: SpellEntry): Omit<Spell, 'id'> {
  return compact({
    name: e.name, lvl: e.lvl, time: e.time, range: e.range, dur: e.dur, comp: e.comp, cid: e.id, c: e.conc, ritual: e.ritual,
    school: e.school, classes: e.classes, desc: e.desc, atk: e.atk, save: e.save, fx: e.fx, dmg: e.dice, dtype: e.dtype, scale: e.scale,
    higher: e.higher, acFx: e.acFx, acVal: e.acVal, healMod: e.healMod, dmgMod: e.dmgMod, dtypes: e.dtypes,
    parts: e.parts?.map((p) => ({ ...p })), prep: true, dice: spellSummary(e)
  });
}

const ITEM_COPY = ['cost', 'wt', 'wcat', 'wrange', 'dmg', 'dtype', 'props', 'thrown', 'vers', 'ammo', 'mastery', 'armor', 'acBase', 'acBonus',
  'strReq', 'stealthDis', 'cap', 'capVol', 'xdim', 'rarity', 'attune', 'magic'] as const;
// A catalog item as a character's item: one, not equipped. Charges: a whole number fills count and max; a formula
// ('pb') is maxV with count 0 (addFromCatalog fills it to the maximum). `base` is copied only as an item id, never
// the generic 'armor'/'weapon'. Grants are not copied here (addFromCatalog adds them, linked to the new item).
// Rolled starting charges ('1d3', '1d8+1') are the add flow's answer (`item.charges`): without one the item gets no
// counter at all (a preview, a test). `base`: the base item the player chose (its fields are already in `e`, withBase),
// read for the name. A chosen bonus is the item's magic, or its acBonus for armor and a Shield.
export function itemFromEntry(e: ItemEntry, item?: ItemAnswers, base?: ItemEntry): Omit<Item, 'id'> {
  const { name, rarity } = answeredName(e, base, item?.bonus);
  const out: Record<string, unknown> = { name, qty: 1, eq: false, cat: e.cat, desc: e.desc, cid: e.id };
  for (const k of ITEM_COPY) out[k] = e[k];
  out.rarity = rarity;
  if (e.magicPick && item?.bonus) out[e.armor ? 'acBonus' : 'magic'] = item.bonus;
  if (e.base?.startsWith('item/')) out.base = e.base;
  const rolled = e.charges !== undefined && diceRange(e.charges) !== null;
  if (e.charges !== undefined && (!rolled || item?.charges !== undefined)) {
    if (rolled) Object.assign(out, { count: item!.charges, max: item!.charges });
    else if (/^\d+$/.test(e.charges)) Object.assign(out, { count: Number(e.charges), max: Number(e.charges) });
    else Object.assign(out, { count: 0, maxV: e.charges });
    Object.assign(out, { recharge: e.recharge, regain: e.regain, regainOn: e.regainOn });
  }
  return compact(out) as Omit<Item, 'id'>;
}

// The add flow's answers about an item, next to the picks (plan 7): the base item id the player chose, the +1/+2/+3
// bonus, and the starting charges when they are rolled.
export interface ItemAnswers { base?: string; bonus?: 1 | 2 | 3; charges?: number }

// The added item's name and rarity, after the answers. A +1/+2/+3 item is '<name> +N' without its ", +1, +2, or +3",
// the chosen base's name standing in for the generic word ('Longsword +2'); a named item keeps its name with the base
// in brackets ('Holy Avenger (Longsword)'). A rarity per bonus ("Uncommon (+1), Rare (+2)…") narrows to the bonus's.
export function answeredName(e: ItemEntry, base?: ItemEntry, bonus?: number): { name: string; rarity?: string } {
  const rarity = bonus && e.rarity ? new RegExp(`([A-Z][a-z]+(?: [A-Z][a-z]+)?) \\(\\+${bonus}\\)`).exec(e.rarity)?.[1] ?? e.rarity : e.rarity;
  if (e.magicPick && bonus) return { name: `${base ? base.name : e.name.replace(/, \+1, \+2, or \+3$/, '')} +${bonus}`, rarity };
  return { name: base ? `${e.name} (${base.name})` : e.name, rarity };
}
const BASE_LABEL: Record<string, string> = { weapon: 'Which weapon?', armor: 'Which armor?', ammo: 'Which ammunition?' };
// The mundane items an entry's base may be: its baseOf list, else every weapon ('weapon'), armor ('armor', no Shield) or
// piece of ammunition ('ammo').
function baseOptions(cat: Catalog, e: ItemEntry): ItemEntry[] {
  const kind = e.base as ItemEntry['cat'];
  const all = cat.list.filter((x): x is ItemEntry => x.kind === 'item' && x.cat === kind);
  if (!e.baseOf) return all.sort((a, b) => a.name.localeCompare(b.name));
  return e.baseOf.split(',').map((id) => all.find((x) => x.id === id)).filter((x): x is ItemEntry => !!x);
}
// One question the add flow asks about an item, in the order base, bonus, charges. `min`/`max` bound a number answer.
export interface ItemQuestion { key: 'base' | 'bonus' | 'charges'; label: string; options?: { value: string; label: string }[]; min?: number; max?: number }
// The questions an entry needs answered when it is added: the item questions screen and checkAnswers both read them.
export function itemQuestions(cat: Catalog, e: Entry): ItemQuestion[] {
  if (e.kind !== 'item') return [];
  const out: ItemQuestion[] = [];
  if (e.base && BASE_LABEL[e.base]) out.push({ key: 'base', label: BASE_LABEL[e.base], options: baseOptions(cat, e).map((b) => ({ value: b.id, label: b.name })) });
  if (e.magicPick) out.push({ key: 'bonus', label: '+1, +2 or +3', options: ['1', '2', '3'].map((v) => ({ value: v, label: '+' + v })) });
  const range = e.charges === undefined ? null : diceRange(e.charges);
  if (range) out.push({ key: 'charges', label: `Starting charges (roll ${e.charges!.replace(/\+/g, ' + ')})`, min: range[0], max: range[1] });
  return out;
}
// Throws when an item question is unanswered or out of range.
function checkItemAnswers(cat: Catalog, e: Entry, a: ItemAnswers | undefined): void {
  for (const q of itemQuestions(cat, e)) {
    if (q.key === 'base' && !q.options!.some((o) => o.value === a?.base)) throw new Error(`${e.name}: ${q.label.toLowerCase().replace('?', '')} — choose one it allows`);
    if (q.key === 'bonus' && ![1, 2, 3].includes(a?.bonus as number)) throw new Error(`${e.name}: choose its bonus, +1, +2 or +3`);
    if (q.key === 'charges') {
      const n = a?.charges;
      if (n === undefined || !Number.isInteger(n) || n < q.min! || n > q.max!) throw new Error(`${e.name}: give its starting charges (${q.min}–${q.max})`);
    }
  }
}

// A line from a weapon's or armor's fields, shown where it has no description (the SRD gives weapons and armor only
// table rows). Armor adds Dex in full (Light), at most 2 (Medium) or not at all (Heavy) (PHB p.219). '' for anything else.
type StatFields = Pick<ItemEntry, 'wcat' | 'wrange' | 'dmg' | 'dtype' | 'props' | 'thrown' | 'vers' | 'ammo' | 'mastery' | 'armor' | 'acBase' | 'strReq' | 'stealthDis'>;
// 'two-handed' → 'Two-Handed'.
export const capWords = (s: string) => s.replace(/(^|-)([a-z])/g, (m) => m.toUpperCase());
export function itemStats(x: StatFields): string {
  if (x.armor === 'shield') return `Shield · +${x.acBase ?? 2} AC`;
  if (x.armor) {
    const dex = x.armor === 'light' ? ' + Dex' : x.armor === 'medium' ? ' + Dex (max 2)' : '';
    return [`${capWords(x.armor)} armor`, `AC ${x.acBase}${dex}`, x.strReq && `Strength ${x.strReq}`, x.stealthDis && 'Stealth Disadvantage'].filter(Boolean).join(' · ');
  }
  if (!x.wcat && !x.dmg) return '';
  const [range, kind] = (x.ammo ?? '').split(';');
  const props = (x.props ?? '').split(',').filter(Boolean).map((p) =>
    p === 'thrown' && x.thrown ? `Thrown (${x.thrown})` : p === 'versatile' && x.vers ? `Versatile (${x.vers})`
      : p === 'ammunition' && x.ammo ? `Ammunition (${[range, kind && capWords(kind)].filter(Boolean).join(', ')})` : capWords(p)).join(', ');
  return [[x.wcat && capWords(x.wcat), x.wrange, 'weapon'].filter(Boolean).join(' '),
    [x.dmg, x.dtype].filter(Boolean).join(' '), props, x.mastery && `Mastery: ${capWords(x.mastery)}`].filter(Boolean).join(' · ');
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
  charges: boolean; chMaxKind: MaxKind; chMaxText: string; chCount: number; chRecharge: Recharge; chRegain: string;
  cat: ItemEntry['cat']; cost?: string; rarity?: string; cid?: string; base?: string;
}
// Unticking Always prepared leaves a spell with neither flag, which loads as prepared (migrate). So an edit that isn't
// always prepared states its prepared flag. existing: the spell before the edit.
export const keepPrep = (existing: Spell | undefined, always: boolean): Partial<Pick<Spell, 'prep'>> =>
  (!existing || always ? {} : { prep: !!existing.prep });

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
// Armor can't be saved without a base AC (a Shield left blank is +2, PHB p.219): migrate() would drop the armor data on reload.
export const armorBaseMissing = (d: ItemDraft): boolean => d.kind === 'armor' && d.armor !== 'shield' && number(d.acBase) === undefined;
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
  const regainOn = regainEvent(d.chRecharge);
  const regain = d.charges && regainOn ? text(d.chRegain) : undefined;
  const max = (d.charges && maxFields(d.chMaxKind, d.chMaxText)) || {};
  return {
    name: d.name.trim(), qty: d.qty, desc: text(d.desc), wt: parseWeight(d.wt), attune: d.attune || undefined,
    cat: d.cat, cost: d.cost, rarity: d.rarity, cid: d.cid, base: d.base,
    wcat: w ? d.wcat : undefined, wrange: w ? d.wrange : undefined, dmg: w ? text(d.dmg) : undefined, dtype: w ? text(d.dtype) : undefined,
    props: props.length ? props.join(',') : undefined,
    thrown: has('thrown') ? text(d.thrownRange) : undefined,
    vers: has('versatile') ? text(d.versDie) : undefined,
    // Range and ammunition type each kept when the other is empty ('150/600;', ';arrow').
    ammo: has('ammunition') && (range || slug(d.ammoType)) ? `${range ?? ''};${slug(d.ammoType)}` : undefined,
    // magic: a weapon's input; on any other kind it has no input and passes through from the draft (a wand's +2).
    mastery: w ? text(d.mastery) : undefined, magic: nonZero(d.magic),
    armor: a ? d.armor : undefined, acBase: a ? number(d.acBase) ?? (d.armor === 'shield' ? 2 : undefined) : undefined, acBonus: a ? nonZero(d.acBonus) : undefined,
    strReq: a ? nonZero(d.strReq) : undefined, stealthDis: (a && d.stealthDis) || undefined,
    xdim: (box && d.xdim) || undefined, cap: box ? parseWeight(d.cap) : undefined, capVol: box ? text(d.capVol) : undefined,
    count: d.charges ? d.chCount : undefined, max: max.max, maxV: max.maxV, recharge: d.charges ? d.chRecharge : undefined,
    regain, regainOn: regain ? regainOn : undefined
  };
}

// The form's kind for an item: weapon fields → weapon, armor → armor, a capacity (pounds, or a volume or count such as
// a Chest's 12 cubic feet) → container, else none.
const kindOfItem = (it: Item): ItemKind =>
  it.wcat || it.wrange || it.dmg ? 'weapon' : it.armor ? 'armor' : it.xdim || it.cap !== undefined || it.capVol !== undefined ? 'container' : 'none';
const str = (v: number | string | undefined) => (v === undefined ? '' : String(v));
// An item as the custom form's draft; itemFromForm of it gives the item back (minus eq, which the form doesn't own).
export function draftFromItem(it: Item): ItemDraft {
  const kind = kindOfItem(it);
  const [ammoRange = '', ammoType = ''] = it.ammo ? it.ammo.split(';') : [];
  const props = (it.props ? it.props.split(',') : []).filter((p): p is WeaponProp => (WEAPON_PROPS as readonly string[]).includes(p));
  return {
    ...BLANK_ITEM, kind, name: it.name, desc: it.desc ?? '', wt: str(it.wt), qty: it.qty, attune: !!it.attune,
    wcat: it.wcat ?? 'simple', wrange: it.wrange ?? 'melee', dmg: it.dmg ?? '', dtype: it.dtype ?? '', props,
    thrownRange: it.thrown ?? '', versDie: it.vers ?? '', ammoRange, ammoType, mastery: it.mastery ?? '', magic: str(it.magic),
    armor: it.armor ?? 'light', acBase: str(it.acBase), acBonus: kind === 'armor' ? str(it.acBonus) : '', strReq: str(it.strReq), stealthDis: !!it.stealthDis,
    xdim: !!it.xdim, cap: str(it.cap), capVol: it.capVol ?? '',
    charges: it.count !== undefined, chMaxKind: maxKindOf(it), chMaxText: it.maxV ?? str(it.max),
    chCount: it.count ?? 0, chRecharge: it.recharge ?? 'dawn', chRegain: it.regain ?? '',
    cat: it.cat ?? catForKind(kind, it.armor), cost: it.cost, rarity: it.rarity, cid: it.cid, base: it.base
  };
}

// A new item named like armor ("Chain Mail", "+1 Shield") with its kind left at None becomes that armor, its category
// with it, so the item's kind and cat agree.
export function withDetectedArmor(d: ItemDraft): ItemDraft {
  const det = d.kind === 'none' ? detectArmor(d.name) : null;
  if (!det?.armor) return d;
  return { ...d, kind: 'armor', armor: det.armor, acBase: str(det.acBase), acBonus: det.acBonus ? String(det.acBonus) : d.acBonus, cat: catForKind('armor', det.armor) };
}

// ---- Choices ----

// One option of a choice step: the pick value, its label, and the catalog entry behind it when there is one.
// taken: the character already has it (marked, still selectable). unmet: a feat's missing prerequisites.
export interface PoolOption { value: string; label: string; entry?: Entry; taken?: boolean; unmet?: string[] }

// Tool groups: ProfEntry has no group field. The generic group names are never options.
export const TOOL_GROUPS: Record<string, string[]> = {
  // Artisan's Tools (PHB p.220-221).
  artisan: ['alchemists-supplies', 'brewers-supplies', 'calligraphers-supplies', 'carpenters-tools', 'cartographers-tools', 'cobblers-tools',
    'cooks-utensils', 'glassblowers-tools', 'jewelers-tools', 'leatherworkers-tools', 'masons-tools', 'painters-supplies', 'potters-tools',
    'smiths-tools', 'tinkers-tools', 'weavers-tools', 'woodcarvers-tools'].map((t) => `prof/${t}`),
  'gaming-set': ['prof/dice', 'prof/dragonchess', 'prof/playing-cards', 'prof/three-dragon-ante'],
  'musical-instrument': ['prof/bagpipes', 'prof/drum', 'prof/dulcimer', 'prof/flute', 'prof/horn', 'prof/lute', 'prof/lyre', 'prof/pan-flute', 'prof/shawm', 'prof/viol']
};
export const GENERIC_TOOLS: string[] = ['prof/gaming-set', 'prof/musical-instrument'];
// Pool kinds whose picks are names, so typed text still works when the pool offers nothing.
const NAME_KINDS = ['spell', 'tool', 'language'];
const KNOWN_KINDS = [...NAME_KINDS, 'skill', 'ability', 'list', 'prof', 'weapon', 'feat', 'trait', 'subclass', 'feature'];
// Weapon category entries in the proficiency list (not weapon kinds, so never a mastery pick).
const WEAPON_CATEGORIES = ['prof/simple-weapons', 'prof/martial-weapons'];

const isRef = (v: unknown): v is string => typeof v === 'string' && /^\$[\w-]+$/.test(v);
const ABILITY_NAME = Object.fromEntries(ABILITIES) as Record<Ability, string>;
const SKILL_NAME = Object.fromEntries(SKILLS.map(([k, n]) => [k, n])) as Record<string, string>;
const profsOf = (cat: Catalog, pc: ProfEntry['cat']) => entriesOf(cat, 'prof').filter((p) => p.cat === pc);
const byName = (a: PoolOption, b: PoolOption) => a.label.localeCompare(b.label);

const grantsOf = (e: Entry) => ('grants' in e && e.grants ? e.grants : []);
// The entry's choices in order (a class's skill choice is not one of its grants, so not included).
export function choicesOf(e: Entry): ChoiceSpec[] {
  return grantsOf(e).filter((s): s is ChoiceSpec => s.kind === 'choice');
}

// One button per option, or per `opt` group (all of whose grants come with the pick); the value is the first option's id.
export function optionGroups(choice: ChoiceSpec): { value: string; label: string; ids: string[] }[] {
  const out: { value: string; label: string; ids: string[] }[] = [];
  for (const o of choice.options ?? []) {
    const g = o.opt !== undefined ? out.find((x) => x.label === o.opt && x.ids.length) : undefined;
    if (g) g.ids.push(o.id);
    else out.push({ value: o.id, label: o.opt ?? o.name, ids: [o.id] });
  }
  return out;
}

// The picks that count: empty text dropped, an option at most once (twice with repeat), at most `pick` of them.
export function validPicks(choice: ChoiceSpec, picks: string[]): string[] {
  const out: string[] = [];
  for (const p of picks) {
    if (!p.trim() || out.length >= choice.pick) continue;
    const n = out.filter((x) => x === p).length;
    if (n === 0 || (n === 1 && choice.repeat)) out.push(p);
  }
  return out;
}

// '<kind>:<filter>' with every '$ref' replaced by that choice's first pick; null when a ref has no pick yet.
function expandPool(pool: string, picks: Record<string, string[]>): { kind: string; filter: string } | null {
  let missing = false;
  const p = pool.replace(/\$([\w-]+)/g, (_, id: string) => { const v = picks[id]?.find((x) => x.trim()); if (!v) missing = true; return v ?? ''; });
  if (missing) return null;
  const i = p.indexOf(':');
  return i < 0 ? null : { kind: p.slice(0, i), filter: p.slice(i + 1) };
}

// key=value terms ('list=druid;lvl=0', 'school=evocation', 'lvl<=2', 'lvl=6|7|8|9'); null when one doesn't parse.
function terms(filter: string): { key: string; op: '=' | '<=' | '>='; vals: string[] }[] | null {
  const out = [];
  for (const t of filter.split(';')) {
    const m = /^([a-z]+)(<=|>=|=)([\w|/-]+)$/i.exec(t.trim());
    if (!m) return null;
    out.push({ key: m[1], op: m[2] as '=' | '<=' | '>=', vals: m[3].toLowerCase().split('|') });
  }
  return out;
}
function matches(e: Record<string, unknown>, ts: { key: string; op: string; vals: string[] }[], known: string[]): boolean | null {
  for (const t of ts) {
    if (!known.includes(t.key)) return null;
    const v = e[t.key];
    if (t.op !== '=') {
      const n = Number(t.vals[0]);
      if (t.vals.length !== 1 || !Number.isFinite(n) || typeof v !== 'number') return null;
      if (t.op === '<=' ? v > n : v < n) return false;
    } else if (t.key === 'list') {
      const classes = String(e.classes ?? '').toLowerCase().split(',');
      if (!t.vals.some((x) => classes.includes(x))) return false;
    } else if (!t.vals.includes(String(v ?? '').toLowerCase())) return false;
  }
  return true;
}
// Entries filtered by the pool's terms; [] when a term doesn't parse or names a key the kind doesn't have.
function filtered<T extends Entry>(list: T[], filter: string, known: string[]): T[] {
  const ts = terms(filter);
  if (!ts) return [];
  const out: T[] = [];
  for (const e of list) {
    const m = matches(e as unknown as Record<string, unknown>, ts, known);
    if (m === null) return [];
    if (m) out.push(e);
  }
  return out;
}

// The character already has it: a spell, feature or item with its catalog id, or, without one, the same name.
const onSheet = (list: { cid?: string; name: string }[], e: Entry) => list.some((x) => (x.cid ? x.cid === e.id : normName(x.name) === normName(e.name)));
export const hasSpell = (c: Character, e: Entry) => onSheet(c.spells, e);
export const hasFeature = (c: Character, e: Entry) => onSheet(c.feats, e);
export const hasItem = (c: Character, e: Entry) => onSheet(c.inv, e);

// The options a pool offers this character. `adding`: the entry whose choice this is and those above it in the flow,
// which count as on the sheet for feat prerequisites (a Fighting Style feature offering style feats).
export function poolOptions(cat: Catalog, c: Character, pool: string, picks: Record<string, string[]>, adding: Entry[] = []): PoolOption[] {
  const p = expandPool(pool, picks);
  if (!p) return [];
  const { kind, filter } = p;
  const ent = (e: Entry, taken: boolean): PoolOption => ({ value: e.id, label: e.name, entry: e, ...(taken ? { taken } : {}) });
  const words = filter.split('|');
  const prof = (pc: ProfEntry['cat'], e: ProfEntry): PoolOption => ({ value: e.name, label: e.name, entry: e, ...(hasProf(c, pc, e.name) ? { taken: true } : {}) });
  const skill = (k: string): PoolOption => ({ value: k, label: SKILL_NAME[k], ...(skillLevel(c, k).level >= 1 ? { taken: true } : {}) });
  switch (kind) {
    case 'spell':
      return filtered(entriesOf(cat, 'spell'), filter, ['list', 'lvl', 'school', 'ritual']).map((e) => ent(e, hasSpell(c, e))).sort(byName);
    case 'feat':
      return filtered(entriesOf(cat, 'feat'), filter, ['cat']).map((e) => {
        const { missing } = prereqMet(c, e.prereq, adding);
        return { ...ent(e, hasFeature(c, e)), ...(missing.length ? { unmet: missing } : {}) };
      }).sort(byName);
    case 'feature':
      return filtered(entriesOf(cat, 'feature'), filter, ['of']).map((e) => {
        const { missing } = prereqMet(c, e.prereq, adding);
        return { ...ent(e, !e.repeat && hasFeature(c, e)), ...(missing.length ? { unmet: missing } : {}) };
      }).sort(byName);
    case 'subclass':
      return filtered(entriesOf(cat, 'subclass'), filter, ['cls']).map((e) => ent(e, hasFeature(c, e))).sort(byName);
    case 'trait':
      return filtered(entriesOf(cat, 'trait'), filter, ['of']).map((e) => ent(e, hasFeature(c, e))).sort(byName);
    case 'skill': {
      if (filter === 'proficient') return SKILLS.filter(([k]) => skillLevel(c, k).level === 1).map(([k]) => ({ value: k, label: SKILL_NAME[k] }));
      const keys = filter === 'any' ? SKILLS.map(([k]) => k) : words.filter((k) => SKILL_NAME[k]);
      return keys.map(skill);
    }
    case 'language':
      return filter === 'any' ? profsOf(cat, 'language').map((e) => prof('language', e)) : [];
    case 'tool': {
      const tools = profsOf(cat, 'tool').filter((e) => !GENERIC_TOOLS.includes(e.id));
      const list = filter === 'any' ? tools : tools.filter((e) => TOOL_GROUPS[filter]?.includes(e.id));
      return list.map((e) => prof('tool', e)).sort(byName);
    }
    case 'weapon':
      return filter === 'any' ? profsOf(cat, 'weapon').filter((e) => !WEAPON_CATEGORIES.includes(e.id)).map((e) => ({ value: e.name, label: e.name, entry: e })) : [];
    case 'ability':
      return words.filter((k) => k in ABILITY_NAME).map((k) => ({ value: k, label: ABILITY_NAME[k as Ability] }));
    case 'list':
      return words.filter(Boolean).map((k) => ({ value: k, label: capital(k) }));
    case 'prof': {
      const out: PoolOption[] = [];
      if (words.includes('skill')) out.push(...SKILLS.map(([k]) => skill(k)));
      if (words.includes('tool')) out.push(...profsOf(cat, 'tool').filter((e) => !GENERIC_TOOLS.includes(e.id)).map((e) => prof('tool', e)).sort(byName));
      return out;
    }
    default:
      return [];
  }
}

const poolKind = (pool: string) => pool.slice(0, Math.max(0, pool.indexOf(':')));
// True when the choice is answered by typing: a pool kind the app doesn't know (no catalog entry has one), or a name pool (spell,
// tool, language) that offers nothing here. Other kinds need a key or an id, so they are never typed.
export function freeText(cat: Catalog, c: Character, pool: string, picks: Record<string, string[]>): boolean {
  const kind = poolKind(pool);
  if (!KNOWN_KINDS.includes(kind)) return true;
  return NAME_KINDS.includes(kind) && poolOptions(cat, c, pool, picks).length === 0;
}

// Picks this choice needs: `pick`, or for a pool with options, no more than it offers (none when it offers none).
export function needed(cat: Catalog, c: Character, choice: ChoiceSpec, picks: Record<string, string[]>): number {
  if (!choice.pool || freeText(cat, c, choice.pool, picks)) return choice.pick;
  return Math.min(choice.pick, poolOptions(cat, c, choice.pool, picks).length);
}

// The ids of the choices with fewer valid picks than they need.
export function missingPicks(cat: Catalog, c: Character, e: Entry, picks: Record<string, string[]>): string[] {
  return choicesOf(e).filter((ch) => validPicks(ch, picks[ch.id] ?? []).length < needed(cat, c, ch, picks)).map((ch) => ch.id);
}

type Resolved = Omit<GrantSpec, 'opt'>;
// An entry added below another one; preset: choices already answered (a background's origin feat list).
type Nested = { entry: Entry; preset?: Record<string, string[]> };
// The entry's grants with the player's picks applied: picked options (an option picked twice gets ids -0 and -1),
// '$ref' fields filled (a grant over a multi-pick choice copied once per pick, ids -<index>; one over a choice with no
// valid picks dropped), a `casts` ref pointed at the spell spec of the same pick, and picks no grant uses turned into
// proficiencies (skills, tools, languages, weapon masteries), entries (feats, traits, subclasses) or notes.
export function resolveChoices(cat: Catalog, e: Entry, picks: Record<string, string[]>):
  { specs: Resolved[]; entries: Nested[]; notes: string[] } {
  const choices = new Map(choicesOf(e).map((ch) => [ch.id, ch]));
  const vp = (id: string) => { const ch = choices.get(id); return ch ? validPicks(ch, picks[id] ?? []) : []; };
  const strip = ({ opt: _o, ...g }: GrantSpec): Resolved => g;
  const raw: Resolved[] = [];
  for (const s of grantsOf(e)) {
    if (s.kind !== 'choice') { raw.push(strip(s)); continue; }
    if (!s.options) continue;
    const got = vp(s.id);
    for (const v of [...new Set(got)]) {
      const n = got.filter((x) => x === v).length;
      const group = optionGroups(s).find((g) => g.value === v);
      for (const id of group?.ids ?? []) {
        const o = s.options.find((x) => x.id === id)!;
        if (n === 1) raw.push(strip(o));
        else for (let i = 0; i < n; i++) raw.push({ ...strip(o), id: `${o.id}-${i}` });
      }
    }
  }
  const refsOf = (g: Resolved) => [...new Set(Object.values(g).filter(isRef).map((v) => v.slice(1)))];
  const multi = (id: string) => (choices.get(id)?.pick ?? 1) > 1;
  // The id the spell spec over choice `ref` gets for pick i (Magic Initiate's free cast → its level 1 spell).
  const spellSpecId = (ref: string, i: number) => {
    const sp = raw.find((g) => g.kind === 'spell' && g.spell === '$' + ref);
    return sp ? (multi(ref) ? `${sp.id}-${i}` : sp.id) : undefined;
  };
  const fill = (g: Resolved, i: number, id: string): Resolved => {
    const out: Record<string, unknown> = { ...g, id };
    for (const [k, v] of Object.entries(g)) {
      if (!isRef(v)) continue;
      const ref = v.slice(1), at = multi(ref) ? i : 0, pick = vp(ref)[at];
      out[k] = k === 'casts' ? spellSpecId(ref, at) ?? pick : pick;
      // A free cast of a picked spell is named after the spell ("Magic Missile (free cast)"), not the spec's label
      // ("Level 1 spell (free cast)"), so two of them tell apart in Resources.
      if (k === 'casts' && g.kind === 'resource' && pick) out.name = (pick.startsWith('spell/') ? cat.byId.get(pick)?.name ?? titleOfId(pick) : pick) + ' (free cast)';
    }
    return out as Resolved;
  };
  const specs: Resolved[] = [];
  const used = new Set<string>();
  for (const g of raw) {
    const refs = refsOf(g);
    refs.forEach((r) => used.add(r));
    if (refs.some((r) => vp(r).length === 0)) continue;
    const many = refs.filter(multi);
    if (many.length > 1) throw new Error(`${e.id}: grant ${g.id} copies over two choices (${many.join(', ')})`);
    if (many.length) vp(many[0]).forEach((_, i) => specs.push(fill(g, i, `${g.id}-${i}`)));
    else specs.push(fill(g, 0, g.id));
  }
  // Choices other choices' pools refer to ($list) are used too.
  for (const ch of choices.values()) for (const m of (ch.pool ?? '').matchAll(/\$([\w-]+)/g)) used.add(m[1]);
  const entries: { entry: Entry }[] = [];
  const notes: string[] = [];
  for (const ch of choices.values()) {
    if (!ch.pool || used.has(ch.id)) continue;
    const kind = poolKind(ch.pool), got = vp(ch.id);
    if (!got.length) continue;
    if (kind === 'feat' || kind === 'trait' || kind === 'subclass' || kind === 'feature') {
      for (const v of got) { const en = cat.byId.get(v); if (en) entries.push({ entry: en }); }
      continue;
    }
    const profCat = (v: string): GrantSpec['cat'] | null => kind === 'skill' ? 'skill' : kind === 'tool' ? 'tool' : kind === 'language' ? 'language'
      : kind === 'weapon' ? 'mastery' : kind === 'prof' ? (SKILL_NAME[v] ? 'skill' : 'tool') : null;
    if (profCat(got[0]) === null) {
      if (kind !== 'ability' && kind !== 'list') notes.push(`${ch.name}: ${got.join(', ')}`);
      continue;
    }
    got.forEach((v, i) => specs.push({ id: `${ch.id}-${i}`, kind: 'prof', name: `${ch.name}: ${SKILL_NAME[v] && profCat(v) === 'skill' ? SKILL_NAME[v] : v}`, cat: profCat(v)!, target: v, ...(ch.orExpert ? { orExpert: true } : {}) }));
  }
  return { specs, entries, notes };
}

// Feature prerequisites by slug: a feature whose cid ends with /<slug>; one without cid whose name, up to its first
// '·', ':' or '(', slugs to it (a hand-typed "Fighting Style · Archery"); or an entry being added in the same flow.
const ARMOR_PROF: Record<string, string> = { light: 'Light armor', medium: 'Medium armor', heavy: 'Heavy armor', shield: 'Shields' };
export const titled = (s: string) => s.split(/[-\s]/).map(capital).join(' ');
export function prereqMet(c: Character, prereq: string | undefined, adding: Entry[] = []): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const t of prereq ? prereq.split(';') : []) {
    let m: RegExpExecArray | null;
    if ((m = /^lvl>=(\d+)$/.exec(t))) { if (c.level < Number(m[1])) missing.push(`Level ${m[1]} or higher`); }
    else if ((m = /^([a-z|]+)>=(\d+)$/.exec(t))) {
      const abs = m[1].split('|') as Ability[];
      if (!abs.some((a) => effScore(c, a) >= Number(m![2]))) missing.push(`${abs.map((a) => ABILITY_NAME[a]).join(' or ')} ${m[2]} or higher`);
    } else if ((m = /^feature=(.+)$/.exec(t))) {
      const slugs = m[1].split('|');
      const has = (sl: string) => c.feats.some((f) => (f.cid ? f.cid.endsWith('/' + sl) : slug(f.name.split(/[·:(]/)[0]) === sl)) ||
        adding.some((e) => e.id.endsWith('/' + sl));
      if (!slugs.some(has)) missing.push(`${slugs.map(titled).join(' or ')} feature`);
    } else if ((m = /^armor=(\w+)$/.exec(t))) {
      if (!hasProf(c, 'armor', ARMOR_PROF[m[1]] ?? m[1])) missing.push(`${ARMOR_PROF[m[1]] ?? m[1]} training`);
    } else missing.push(t);
  }
  return { ok: missing.length === 0, missing };
}

// ---- Adding from the catalog ----

// One entry's answers. nested: the answers of each entry this one adds as its own feature (a background's origin feat,
// a species' traits, a lineage option, a feat picked by a choice), keyed by that entry's id; choice ids are unique only
// within one entry. counted/links: by resolved spec id. group: the feature group to use instead of groupOf's. from:
// the source the new entry hangs from.
export interface AddChoices { picks: Record<string, string[]>; counted: Record<string, boolean>; links: Record<string, string>; nested?: Record<string, AddChoices>; group?: FeatureGroup; from?: string; item?: ItemAnswers }
const NO_ANSWERS: AddChoices = { picks: {}, counted: {}, links: {} };

// The feature group an entry is added under; null for kinds that are never features.
export function groupOf(e: Entry): FeatureGroup | null {
  switch (e.kind) {
    case 'feat': return 'feat';
    case 'trait': case 'species': return 'species';
    case 'background': return 'background';
    case 'subclass': return 'sub';
    case 'feature': return e.sub ? 'sub' : 'class';
    default: return null;
  }
}

const titleOfId = (id: string) => titled(id.split('/').pop() ?? id);
// What addFromCatalog adds as features below e: picked feats, traits and subclasses; a background's origin feat
// ('feat/magic-initiate:cleric' presets the list); a species' traits (not its lineage options, which come by choice).
export function nestedEntries(cat: Catalog, e: Entry, picks: Record<string, string[]>): Nested[] {
  const out: Nested[] = [...resolveChoices(cat, e, picks).entries];
  if (e.kind === 'background') {
    const [id, list] = e.feat.split(':');
    const feat = cat.byId.get(id);
    if (feat) out.push(list === undefined ? { entry: feat } : { entry: feat, preset: { list: [list] } });
  }
  if (e.kind === 'species') {
    const sp = e.id.split('/')[1];
    out.push(...entriesOf(cat, 'trait').filter((t) => t.species === sp && !t.of).map((entry) => ({ entry })));
  }
  return out;
}
// The entry with its choices' pick counts set for this character (Ritual Caster: Proficiency Bonus, PHB p.206).
export function atLevel<E extends Entry>(c: Character, e: E): E {
  if (!('grants' in e) || !e.grants?.some((g) => g.kind === 'choice' && g.pickAt)) return e;
  return { ...e, grants: e.grants.map((g) => (g.kind === 'choice' && g.pickAt ? { ...g, pick: Math.max(1, num(c, g.pickAt)) } : g)) } as E;
}
// The answers for a nested entry: its own answers merged over its preset picks.
const answersFor = (ans: AddChoices, n: Nested): AddChoices => {
  const own = ans.nested?.[n.entry.id] ?? NO_ANSWERS;
  return { ...own, picks: { ...n.preset, ...own.picks } };
};

// Throws when a choice of e, or of an entry nested under it, lacks its picks, so nothing is added half-way.
function checkAnswers(cat: Catalog, c: Character, entry: Entry, ans: AddChoices): void {
  const e = atLevel(c, entry);
  const missing = missingPicks(cat, c, e, ans.picks);
  if (missing.length) {
    const names = missing.map((id) => choicesOf(e).find((ch) => ch.id === id)?.name ?? id);
    throw new Error(`${e.name}: choose ${names.join(', ')}`);
  }
  checkItemAnswers(cat, e, ans.item);
  for (const n of nestedEntries(cat, e, ans.picks)) checkAnswers(cat, c, n.entry, answersFor(ans, n));
}

// "Magic Initiate (Cleric)": the entry's name, plus the label of its list choice's pick.
export function featureName(cat: Catalog, c: Character, e: Entry, picks: Record<string, string[]>): string {
  const ch = choicesOf(e).find((x) => x.pool?.startsWith('list:'));
  const v = ch && picks[ch.id]?.[0];
  const label = v && poolOptions(cat, c, ch.pool!, picks).find((o) => o.value === v)?.label;
  return label ? `${e.name} (${label})` : e.name;
}

// The spell a resolved `spell` spec creates: the catalog spell, the typed name of a free-text pick (at the pool's level
// when it names one), or undefined for a catalog id the loaded catalog lacks (addGrants then names it after the spec).
function spellFor(cat: Catalog, e: Entry, spec: Resolved): Omit<Spell, 'id'> | undefined {
  const v = spec.spell;
  if (!v || v.startsWith('$')) return undefined;
  if (v.startsWith('spell/')) { const se = cat.byId.get(v); return se?.kind === 'spell' ? spellFromEntry(se) : undefined; }
  const src = grantsOf(e).find((g) => g.kind === 'spell' && (g.id === spec.id || spec.id.startsWith(g.id + '-')));
  const ref = src?.kind === 'spell' && src.spell?.startsWith('$') ? src.spell.slice(1) : undefined;
  const pool = ref ? choicesOf(e).find((ch) => ch.id === ref)?.pool ?? '' : '';
  const lvl = /(?:^|[:;])lvl=(\d)(?:;|$)/.exec(pool)?.[1];
  return { name: v, lvl: lvl ? Number(lvl) : 0, time: '', range: '' };
}

// The name of the spell a resolved `spell` spec creates: the catalog spell's ("Guidance"), the typed text, or the
// spec's own when the catalog lacks it. ChoiceFlow asks findUnlinked with it, never with the spec's label ("Cantrips").
export function grantSpellName(cat: Catalog, spec: Pick<GrantSpec, 'spell' | 'name'>): string {
  const v = spec.spell;
  if (!v || v.startsWith('$')) return spec.name;
  return v.startsWith('spell/') ? cat.byId.get(v)?.name ?? spec.name : v;
}

// A catalog spell's own grants (Shillelagh's atkAbil), from the character's spell `id`. Grants that spell already has
// (same kind and name) are skipped, so linking a spell added from the picker never doubles them.
function addSpellGrants(c: Character, cat: Catalog, cid: string | undefined, id: string): Character {
  const se = cid ? cat.byId.get(cid) : undefined;
  if (!se || se.kind !== 'spell' || !se.grants?.length) return c;
  const link = linkOf('spell', id);
  const have = c.grants.filter((g) => g.from === link);
  const specs = resolveChoices(cat, se, {}).specs.filter((s) => !have.some((g) => g.kind === s.kind && g.name === s.name));
  return specs.length ? addGrants(c, link, specs.map((spec) => ({ spec }))) : c;
}

// The entry's resolved grants as addGrants inputs, with the player's counted and link answers and the spells they make.
function inputsOf(cat: Catalog, e: Entry, ans: AddChoices, specs: Resolved[]): GrantInput[] {
  return specs.map((spec) => {
    const sp = spec.kind === 'spell' ? spellFor(cat, e, spec) : undefined;
    return { spec, ...(ans.counted[spec.id] ? { counted: true } : {}), ...(ans.links[spec.id] ? { link: ans.links[spec.id] } : {}), ...(sp ? { spell: sp } : {}) };
  });
}

// Adds grants from `from`, then the own grants of every catalog spell they created or linked.
function addWithSpells(c: Character, cat: Catalog, from: string, inputs: GrantInput[]): Character {
  if (!inputs.length) return c;
  const before = new Set(c.spells.map((x) => x.id));
  let out = addGrants(c, from, inputs);
  for (const sp of out.spells.filter((x) => !before.has(x.id))) out = addSpellGrants(out, cat, sp.cid, sp.id);
  for (const input of inputs) if (input.spec.kind === 'spell' && input.link) out = addSpellGrants(out, cat, input.spec.spell, input.link);
  return out;
}

// The spell's source when the character's class has it on its list.
function classSource(cat: Catalog, c: Character, e: SpellEntry): Pick<Spell, 'srcKind' | 'srcName'> {
  const cls = cat.byId.get(classIdOf(cat, c));
  return cls && e.classes.split(',').includes(cls.id.split('/')[1]) ? { srcKind: 'class', srcName: cls.name } : {};
}

// ---- Class, subclass and species ids ----

// The id of the entry whose name matches the text (trimmed, any case), or ''. A subclass is looked for within `cls`
// (a class id); a species also matches by the name of one of its lineage options ('Wood Elf' → species/elf).
export function matchId(cat: Catalog, kind: 'class' | 'subclass' | 'species', text: string, cls?: string): string {
  const n = normName(text);
  if (!n) return '';
  if (kind === 'subclass') {
    const c = cls?.split('/')[1];
    return entriesOf(cat, 'subclass').find((e) => e.cls === c && normName(e.name) === n)?.id ?? '';
  }
  const hit = entriesOf(cat, kind).find((e) => normName(e.name) === n)?.id;
  if (hit || kind === 'class') return hit ?? '';
  const option = entriesOf(cat, 'trait').find((t) => t.of && normName(t.name) === n);
  return option && cat.byId.has('species/' + option.species) ? 'species/' + option.species : '';
}
// The character's class id: the stored one when the loaded catalog has it, else the typed name matched again.
export function classIdOf(cat: Catalog, c: Character): string {
  return c.ch.clsId && cat.byId.get(c.ch.clsId)?.kind === 'class' ? c.ch.clsId : matchId(cat, 'class', c.ch.cls);
}
// The character's subclass id: the stored one when the catalog has it under the class, else the typed name matched.
export function subclassIdOf(cat: Catalog, c: Character): string {
  const cls = classIdOf(cat, c);
  const stored = c.ch.subId ? cat.byId.get(c.ch.subId) : undefined;
  return stored?.kind === 'subclass' && stored.cls === cls.split('/')[1] ? stored.id : matchId(cat, 'subclass', c.ch.sub, cls);
}

// Adds a catalog entry with the player's answers: a spell or item with its grants, or a feature (feat, trait,
// species, background, subclass, class feature) with its grants and every entry nested under it, each linked to
// what it came from. Throws when a choice is unanswered, before changing anything.
export function addFromCatalog(c: Character, cat: Catalog, e: Entry, ans: AddChoices): Character {
  checkAnswers(cat, c, e, ans);
  return addEntry(c, cat, e, ans);
}

function addEntry(c: Character, cat: Catalog, entry: Entry, ans: AddChoices): Character {
  const e = atLevel(c, entry);
  const r = resolveChoices(cat, e, ans.picks);
  const id = newId();
  const srcKind = ans.from ? srcKindOfLink(c, ans.from) : null;
  const link: Linked = ans.from ? { from: ans.from, ...(srcKind ? { srcKind } : {}) } : {};
  if (e.kind === 'spell') {
    const out: Character = { ...c, spells: [...c.spells, { id, ...spellFromEntry(e), ...classSource(cat, c, e), ...link }] };
    return addWithSpells(out, cat, linkOf('spell', id), inputsOf(cat, e, ans, r.specs));
  }
  if (e.kind === 'item') {
    // A base the player chose (checked by checkAnswers): its fields copied in, then named after it. Ammunition has no
    // fields to copy: only its id is kept, so the ammunition type follows it (ammoType).
    const b = ans.item?.base && BASE_LABEL[e.base ?? ''] ? cat.byId.get(ans.item.base) as ItemEntry : undefined;
    const based = b && (e.base === 'ammo' ? { ...e, base: b.id } : withBase(e, b));
    const it: Item = { id, ...(b ? itemFromEntry(based!, ans.item, b) : itemFromEntry(e, ans.item)) };
    if (it.maxV !== undefined) it.count = maxOf(c, it) ?? 0;
    return addWithSpells({ ...c, inv: [...c.inv, it] }, cat, linkOf('item', id), inputsOf(cat, e, ans, r.specs));
  }
  const g = ans.group ?? groupOf(e);
  if (!g) throw new Error(`${e.name}: a ${e.kind} entry can't be added`);
  let out: Character = { ...c, ch: { ...c.ch } };
  const lines = [e.desc, ...r.notes];
  if (e.kind === 'background') {
    if (e.equip) lines.push('Equipment: ' + e.equip);
    const featId = e.feat.split(':')[0];
    if (!cat.byId.has(featId)) lines.push(`Origin feat: ${titleOfId(featId)} (not in the loaded catalog)`);
  }
  if (e.kind === 'subclass' && !c.ch.sub.trim()) {
    out.ch.sub = e.name;
    out.ch.subId = e.id;
  }
  if (e.kind === 'species' && !c.ch.species.trim()) {
    out.ch.species = e.name;
    out.speedBase = e.speed;
    const sizes = e.sizes.split(',') as Size[];
    if (sizes.length === 1) out.size = sizes[0];
    else lines.push(`Size: ${sizes.map((x) => capital(x)).join(' or ')} (set it in Edit details)`);
  }
  const lvl = e.kind === 'feature' || e.kind === 'trait' ? e.lvl : 0;
  const feature: Feature = {
    id, g, name: featureName(cat, c, e, ans.picks), desc: lines.filter((l) => l.trim()).join('\n'), cid: e.id,
    ...link, ...(lvl > c.level ? { minLvl: lvl } : {})
  };
  out.feats = [...out.feats, feature];
  out = addWithSpells(out, cat, linkOf('feature', id), inputsOf(cat, e, ans, r.specs));
  for (const n of nestedEntries(cat, e, ans.picks)) out = addEntry(out, cat, n.entry, { ...answersFor(ans, n), from: linkOf('feature', id) });
  return out;
}

// ---- The custom spell form ----

// The spell form as typed. Linked fields (from, srcKind, srcName) ride along for the SourcePicker; the save handler
// writes them. Catalog-only fields (cid, school, classes, scale, ritual, healMod, dmgMod, dtypes, parts) have no input; the draft carries them so an
// edit keeps them. freeCast: "Give it a free cast" (a resource the save handler adds or removes).
export interface SpellDraft {
  name: string; lvl: string; time: string; range: string; dice: string; conc: boolean; dur: string; comp: string; always: boolean;
  acFx: AcEffect | ''; acVal: number;
  desc: string; atk: '' | 'melee' | 'ranged'; save: '' | Ability; fx: '' | 'damage' | 'healing' | 'other'; dmg: string; dtype: string; higher: string;
  freeCast: boolean;
  from?: string; srcKind?: SrcKind; srcName?: string;
  cid?: string; school?: string; classes?: string; scale?: string; ritual?: boolean; healMod?: boolean; dmgMod?: boolean; dtypes?: string;
  // Kept as they are when the form's fx or damage dice change: a part is its own row.
  parts?: SpellPart[];
}
export const BLANK_SPELL: SpellDraft = {
  name: '', lvl: '1', time: 'Action', range: '', dice: '', conc: false, dur: '', comp: '', always: false, acFx: '', acVal: 0,
  desc: '', atk: '', save: '', fx: '', dmg: '', dtype: '', higher: '', freeCast: false
};

// The spell form's draft as a spell. Every key the form owns is present, undefined when empty (an edit merges it
// over the old spell); always is true or undefined; `dice` is the typed summary, never computed. Never writes prep
// (toggled on the row; the save handler passes { prep: true } on add) or the linked fields.
export function spellFromForm(d: SpellDraft): Omit<Spell, 'id'> {
  return {
    name: d.name.trim(), lvl: parseInt(d.lvl, 10) || 0, time: d.time, range: d.range.trim(), dice: text(d.dice), c: d.conc,
    dur: text(d.dur), comp: text(d.comp), always: d.always || undefined,
    acFx: d.acFx || undefined, acVal: d.acFx ? d.acVal : undefined,
    desc: text(d.desc), atk: d.atk || undefined, save: d.save || undefined, fx: d.fx || undefined, dmg: text(d.dmg), dtype: text(d.dtype),
    higher: text(d.higher), cid: d.cid, school: d.school, classes: d.classes, scale: d.scale, ritual: d.ritual, healMod: d.healMod,
    // A typed damage type wins over a chosen one's list, so the two never coexist.
    dmgMod: d.dmgMod, dtypes: text(d.dtype) ? undefined : d.dtypes, parts: d.parts
  };
}
export function draftFromSpell(sp: Spell): SpellDraft {
  return {
    name: sp.name, lvl: String(sp.lvl || 0), time: sp.time || 'Action', range: sp.range || '', dice: sp.dice || '', conc: !!sp.c,
    dur: sp.dur || '', comp: sp.comp || '', always: !!sp.always, acFx: sp.acFx || '', acVal: sp.acVal ?? 0,
    desc: sp.desc || '', atk: sp.atk || '', save: sp.save || '', fx: sp.fx || '', dmg: sp.dmg || '', dtype: sp.dtype || '', higher: sp.higher || '',
    freeCast: false, from: sp.from, srcKind: sp.srcKind, srcName: sp.srcName,
    cid: sp.cid, school: sp.school, classes: sp.classes, scale: sp.scale, ritual: sp.ritual, healMod: sp.healMod, dmgMod: sp.dmgMod, dtypes: sp.dtypes, parts: sp.parts
  };
}

// "Already counted in my numbers" applies to these grants: score, speed, initiative, HP per level and AC bonuses.
export const isCountable = (s: Pick<GrantSpec, 'kind' | 'acMode'>) =>
  ['abil', 'speed', 'init', 'hpLvl'].includes(s.kind) || (s.kind === 'ac' && s.acMode === 'bonus');
// Its starting value: off, except an AC bonus of a feature-like entry when the sheet has custom AC bonuses (an older
// sheet often holds it there). An item's grant always starts off: the player is getting the item now.
export function countedDefault(c: Character, e: Entry, spec: Omit<GrantSpec, 'opt'>): boolean {
  return spec.kind === 'ac' && spec.acMode === 'bonus' && e.kind !== 'item' && c.acMods.length > 0;
}

// ---- The feature picker's lists ----

export type FeatureType = 'class' | 'sub' | 'feat' | 'species' | 'background' | 'other';
// The catalog entries of one feature type for this character. ok false: shown but marked (above the character's level,
// or a feat's prerequisites unmet; note says which). taken: on the sheet already (a non-repeatable feat can't be added
// again). Nothing is filtered out: higher-level features stay addable (not a levelling flow).
export function featureCandidates(cat: Catalog, c: Character, t: FeatureType, featCat?: FeatEntry['cat']):
  { entry: Entry; note?: string; ok: boolean; taken: boolean }[] {
  const byLevel = <T extends { lvl: number; name: string }>(a: T, b: T) => a.lvl - b.lvl || a.name.localeCompare(b.name);
  const leveled = (e: FeatureEntry | TraitEntry) => {
    if (e.kind === 'feature' && e.of) {
      const { ok, missing } = prereqMet(c, e.prereq);
      return { entry: e as Entry, ok, taken: !e.repeat && hasFeature(c, e), ...(missing.length ? { note: missing.join(', ') } : {}) };
    }
    return { entry: e as Entry, ok: e.lvl <= c.level, taken: hasFeature(c, e), ...(e.lvl > c.level ? { note: 'Level ' + e.lvl } : {}) };
  };
  const optionsLast = (a: FeatureEntry, b: FeatureEntry) => Number(!!a.of) - Number(!!b.of) || byLevel(a, b);
  switch (t) {
    case 'class': {
      const cls = classIdOf(cat, c).split('/')[1];
      return entriesOf(cat, 'feature').filter((e) => cls && e.cls === cls && !e.sub).sort(optionsLast).map(leveled);
    }
    case 'sub': {
      const sub = subclassIdOf(cat, c).split('/');
      return entriesOf(cat, 'feature').filter((e) => sub.length === 3 && e.cls === sub[1] && e.sub === sub[2]).sort(optionsLast).map(leveled);
    }
    case 'feat': {
      const rows = entriesOf(cat, 'feat').filter((e) => !featCat || e.cat === featCat).map((e) => {
        const { ok, missing } = prereqMet(c, e.prereq);
        return { entry: e as Entry, ok, taken: !e.repeat && hasFeature(c, e), ...(missing.length ? { note: missing.join(', ') } : {}) };
      });
      return [...rows.filter((x) => x.ok), ...rows.filter((x) => !x.ok)];
    }
    case 'species': {
      const sp = matchId(cat, 'species', c.ch.species).split('/')[1];
      return entriesOf(cat, 'trait').filter((e) => sp && e.species === sp && !e.of).sort(byLevel).map(leveled);
    }
    case 'background':
      return entriesOf(cat, 'background').map((e) => ({ entry: e as Entry, ok: true, taken: hasFeature(c, e) }));
    default:
      return [];
  }
}

// The rule text of a weapon's properties, in its own order, then its mastery. A property or mastery the catalog has no
// rule for (homebrew) has none here.
export function weaponRules(cat: Catalog, props: string | undefined, mastery: string | undefined): RuleEntry[] {
  const rules = entriesOf(cat, 'rule');
  return [
    ...(props ? props.split(',') : []).flatMap((p) => rules.filter((e) => e.cat === 'property' && slug(e.name) === slug(p))),
    ...(mastery ? rules.filter((e) => e.cat === 'mastery' && slug(e.name) === slug(mastery)) : [])
  ];
}

const senseKey = (name: string) => name.trim().toLowerCase();
export const senseRule = (cat: Catalog, name: string): RuleEntry | undefined =>
  entriesOf(cat, 'rule').find((e) => e.cat === 'sense' && senseKey(e.name) === senseKey(name));
// Without the catalog: the Senses panel is always on screen, and must not load it until a row opens.
export const hasSenseRule = (name: string) => ['blindsight', 'darkvision', 'tremorsense', 'truesight'].includes(senseKey(name));

// Copying catalog entries onto a character, and the custom forms that build the same fields by hand. Pure functions:
// the pickers and forms call them, then save through update().
import { linkOf, srcKindOfLink } from '../links';
import { ABILITIES, addGrants, effScore, hasProf, maxFields, maxOf, newId, normName, parseWeight, SKILLS, skillLevel, type GrantInput } from '../logic';
import type { Ability, ArmorKind, Character, Feature, FeatureGroup, Item, Linked, Recharge, Size, Spell } from '../types';
import type { Catalog } from './merge';
import { slug, type ChoiceSpec, type Entry, type GrantSpec, type ItemEntry, type ProfEntry, type SpellEntry } from './schema';

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

// ---- Choices ----

// One option of a choice step: the pick value, its label, and the catalog entry behind it when there is one.
// taken: the character already has it (marked, still selectable). unmet: a feat's missing prerequisites.
export interface PoolOption { value: string; label: string; entry?: Entry; taken?: boolean; unmet?: string[] }

// Tool groups: ProfEntry has no group field. The generic group names are never options.
export const TOOL_GROUPS: Record<string, string[]> = {
  'gaming-set': ['prof/dice', 'prof/dragonchess', 'prof/playing-cards', 'prof/three-dragon-ante'],
  'musical-instrument': ['prof/bagpipes', 'prof/drum', 'prof/dulcimer', 'prof/flute', 'prof/horn', 'prof/lute', 'prof/lyre', 'prof/pan-flute', 'prof/shawm', 'prof/viol']
};
export const GENERIC_TOOLS: string[] = ['prof/gaming-set', 'prof/musical-instrument'];
// Pool kinds whose picks are names, so typed text still works when the pool offers nothing.
const NAME_KINDS = ['spell', 'tool', 'language'];
const KNOWN_KINDS = [...NAME_KINDS, 'skill', 'ability', 'list', 'prof', 'weapon', 'feat', 'trait', 'subclass'];
// Weapon category entries in the proficiency list (not weapon kinds, so never a mastery pick).
const WEAPON_CATEGORIES = ['prof/simple-weapons', 'prof/martial-weapons'];

const isRef = (v: unknown): v is string => typeof v === 'string' && /^\$[\w-]+$/.test(v);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ABILITY_NAME = Object.fromEntries(ABILITIES) as Record<Ability, string>;
const SKILL_NAME = Object.fromEntries(SKILLS.map(([k, n]) => [k, n])) as Record<string, string>;
const entriesOfKind = <K extends Entry['kind']>(cat: Catalog, kind: K) => cat.list.filter((e): e is Extract<Entry, { kind: K }> => e.kind === kind);
const profsOf = (cat: Catalog, pc: ProfEntry['cat']) => entriesOfKind(cat, 'prof').filter((p) => p.cat === pc);
const byName = (a: PoolOption, b: PoolOption) => a.label.localeCompare(b.label);

// The entry's choices in order (a class's skill choice is not one of its grants, so not included).
export function choicesOf(e: Entry): ChoiceSpec[] {
  return 'grants' in e && e.grants ? e.grants.filter((s): s is ChoiceSpec => s.kind === 'choice') : [];
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

const hasSpell = (c: Character, e: Entry) => c.spells.some((x) => (x.cid ? x.cid === e.id : normName(x.name) === normName(e.name)));
const hasFeature = (c: Character, e: Entry) => c.feats.some((f) => (f.cid ? f.cid === e.id : normName(f.name) === normName(e.name)));

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
      return filtered(entriesOfKind(cat, 'spell'), filter, ['list', 'lvl', 'school']).map((e) => ent(e, hasSpell(c, e))).sort(byName);
    case 'feat':
      return filtered(entriesOfKind(cat, 'feat'), filter, ['cat']).map((e) => {
        const { missing } = prereqMet(c, e.prereq, adding);
        return { ...ent(e, hasFeature(c, e)), ...(missing.length ? { unmet: missing } : {}) };
      }).sort(byName);
    case 'subclass':
      return filtered(entriesOfKind(cat, 'subclass'), filter, ['cls']).map((e) => ent(e, hasFeature(c, e))).sort(byName);
    case 'trait':
      return filtered(entriesOfKind(cat, 'trait'), filter, ['of']).map((e) => ent(e, hasFeature(c, e))).sort(byName);
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
// True when the choice is answered by typing: an unknown pool kind (metamagic, invocation), or a name pool (spell,
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
// The entry's grants with the player's picks applied: picked options (an option picked twice gets ids -0 and -1),
// '$ref' fields filled (a grant over a multi-pick choice copied once per pick, ids -<index>; one over a choice with no
// valid picks dropped), a `casts` ref pointed at the spell spec of the same pick, and picks no grant uses turned into
// proficiencies (skills, tools, languages, weapon masteries), entries (feats, traits, subclasses) or notes.
export function resolveChoices(cat: Catalog, e: Entry, picks: Record<string, string[]>):
  { specs: Resolved[]; entries: { entry: Entry; preset?: Record<string, string[]> }[]; notes: string[] } {
  const choices = new Map(choicesOf(e).map((ch) => [ch.id, ch]));
  const vp = (id: string) => { const ch = choices.get(id); return ch ? validPicks(ch, picks[id] ?? []) : []; };
  const strip = ({ opt: _o, ...g }: GrantSpec): Resolved => g;
  const raw: Resolved[] = [];
  for (const s of 'grants' in e && e.grants ? e.grants : []) {
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
    if (kind === 'feat' || kind === 'trait' || kind === 'subclass') {
      for (const v of got) { const en = cat.byId.get(v); if (en) entries.push({ entry: en }); }
      continue;
    }
    const profCat = (v: string): GrantSpec['cat'] | null => kind === 'skill' ? 'skill' : kind === 'tool' ? 'tool' : kind === 'language' ? 'language'
      : kind === 'weapon' ? 'mastery' : kind === 'prof' ? (SKILL_NAME[v] ? 'skill' : 'tool') : null;
    if (profCat(got[0]) === null) {
      if (kind !== 'ability' && kind !== 'list') notes.push(`${ch.name}: ${got.join(', ')}`);
      continue;
    }
    got.forEach((v, i) => specs.push({ id: `${ch.id}-${i}`, kind: 'prof', name: `${ch.name}: ${SKILL_NAME[v] && profCat(v) === 'skill' ? SKILL_NAME[v] : v}`, cat: profCat(v)!, target: v }));
  }
  return { specs, entries, notes };
}

// Feature prerequisites by slug: a feature whose cid ends with /<slug>; one without cid whose name, up to its first
// '·', ':' or '(', slugs to it (a hand-typed "Fighting Style · Archery"); or an entry being added in the same flow.
const ARMOR_PROF: Record<string, string> = { light: 'Light armor', medium: 'Medium armor', heavy: 'Heavy armor', shield: 'Shields' };
const titled = (s: string) => s.split('-').map(capital).join(' ');
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
export interface AddChoices { picks: Record<string, string[]>; counted: Record<string, boolean>; links: Record<string, string>; nested?: Record<string, AddChoices>; group?: FeatureGroup; from?: string }
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
export function nestedEntries(cat: Catalog, e: Entry, picks: Record<string, string[]>): { entry: Entry; preset?: Record<string, string[]> }[] {
  const out: { entry: Entry; preset?: Record<string, string[]> }[] = [...resolveChoices(cat, e, picks).entries];
  if (e.kind === 'background') {
    const [id, list] = e.feat.split(':');
    const feat = cat.byId.get(id);
    if (feat) out.push(list === undefined ? { entry: feat } : { entry: feat, preset: { list: [list] } });
  }
  if (e.kind === 'species') {
    const sp = e.id.split('/')[1];
    out.push(...entriesOfKind(cat, 'trait').filter((t) => t.species === sp && !t.of).map((entry) => ({ entry })));
  }
  return out;
}
// The answers for a nested entry: its own answers merged over its preset picks.
const answersFor = (ans: AddChoices, n: { entry: Entry; preset?: Record<string, string[]> }): AddChoices => {
  const own = ans.nested?.[n.entry.id] ?? NO_ANSWERS;
  return { ...own, picks: { ...n.preset, ...own.picks } };
};

// Throws when a choice of e, or of an entry nested under it, lacks its picks, so nothing is added half-way.
function checkAnswers(cat: Catalog, c: Character, e: Entry, ans: AddChoices): void {
  const missing = missingPicks(cat, c, e, ans.picks);
  if (missing.length) {
    const names = missing.map((id) => choicesOf(e).find((ch) => ch.id === id)?.name ?? id);
    throw new Error(`${e.name}: choose ${names.join(', ')}`);
  }
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
  const src = 'grants' in e && e.grants ? e.grants.find((g) => g.kind === 'spell' && (g.id === spec.id || spec.id.startsWith(g.id + '-'))) : undefined;
  const ref = src?.kind === 'spell' && src.spell?.startsWith('$') ? src.spell.slice(1) : undefined;
  const pool = ref ? choicesOf(e).find((ch) => ch.id === ref)?.pool ?? '' : '';
  const lvl = /(?:^|[:;])lvl=(\d)(?:;|$)/.exec(pool)?.[1];
  return { name: v, lvl: lvl ? Number(lvl) : 0, time: '', range: '' };
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

// The spell's source when the character's class (by name) has it on its list.
function classSource(cat: Catalog, c: Character, e: SpellEntry): Pick<Spell, 'srcKind' | 'srcName'> {
  const cls = entriesOfKind(cat, 'class').find((x) => normName(x.name) === normName(c.ch.cls));
  return cls && e.classes.split(',').includes(cls.id.split('/')[1]) ? { srcKind: 'class', srcName: cls.name } : {};
}

// Adds a catalog entry with the player's answers: a spell or item with its grants, or a feature (feat, trait,
// species, background, subclass, class feature) with its grants and every entry nested under it, each linked to
// what it came from. Throws when a choice is unanswered, before changing anything.
export function addFromCatalog(c: Character, cat: Catalog, e: Entry, ans: AddChoices): Character {
  checkAnswers(cat, c, e, ans);
  return addEntry(c, cat, e, ans);
}

function addEntry(c: Character, cat: Catalog, e: Entry, ans: AddChoices): Character {
  const r = resolveChoices(cat, e, ans.picks);
  const linkFields = (x: Character): Linked => {
    if (!ans.from) return {};
    const k = srcKindOfLink(x, ans.from);
    return { from: ans.from, ...(k ? { srcKind: k } : {}) };
  };
  if (e.kind === 'spell') {
    const id = newId();
    const out: Character = { ...c, spells: [...c.spells, { id, ...spellFromEntry(e), ...classSource(cat, c, e), ...linkFields(c) }] };
    return addWithSpells(out, cat, linkOf('spell', id), inputsOf(cat, e, ans, r.specs));
  }
  if (e.kind === 'item') {
    const id = newId();
    const it: Item = { id, ...itemFromEntry(e) };
    if (it.maxV !== undefined) it.count = maxOf(c, it) ?? 0;
    return addWithSpells({ ...c, inv: [...c.inv, it] }, cat, linkOf('item', id), inputsOf(cat, e, ans, r.specs));
  }
  const g = ans.group ?? groupOf(e);
  if (!g) throw new Error(`${e.name}: a ${e.kind} entry can't be added`);
  const id = newId();
  let out: Character = { ...c, ch: { ...c.ch } };
  const lines = [e.desc, ...r.notes];
  if (e.kind === 'background') {
    if (e.equip) lines.push('Equipment: ' + e.equip);
    const featId = e.feat.split(':')[0];
    if (!cat.byId.has(featId)) lines.push(`Origin feat: ${titleOfId(featId)} (not in the loaded catalog)`);
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
    ...linkFields(c), ...(lvl > c.level ? { minLvl: lvl } : {})
  };
  out.feats = [...out.feats, feature];
  out = addWithSpells(out, cat, linkOf('feature', id), inputsOf(cat, e, ans, r.specs));
  for (const n of nestedEntries(cat, e, ans.picks)) out = addEntry(out, cat, n.entry, { ...answersFor(ans, n), from: linkOf('feature', id) });
  return out;
}

// Links between entries (plan 3): what an entry came from, how its source reads, and keeping links free of loops.
// Imports types only, so logic.ts can use it without a cycle.
import type { GrantKind } from './catalog/schema';
import type { Character, ClassRow, Feature, FeatureGroup, Grant, Item, Linked, Spell, SrcKind } from './types';

// Kinds of source an entry can name (roadmap, "Source kinds"), with their labels.
export const SRC_KINDS: [SrcKind, string][] = [
  ['species', 'Species'], ['background', 'Background'], ['class', 'Class'], ['subclass', 'Subclass'],
  ['feat', 'Feat'], ['item', 'Item'], ['spell', 'Spell'], ['other', 'Other']
];
const srcLabel = (k: SrcKind | undefined) => SRC_KINDS.find(([x]) => x === k)?.[1];

// 'class' names a row of c.classes: a class's own grants (its proficiencies) come from it.
export type SourceKind = 'feature' | 'item' | 'spell' | 'class';
const SOURCE_KINDS: SourceKind[] = ['feature', 'item', 'spell', 'class'];

// The character level: the sum of the class rows' levels (0 only for the creator's character before its first level).
// charLevel is what every total-level reader uses (the Proficiency Bonus, cantrips): never below 1.
export const totalLevel = (c: { classes: { lvl: number }[] }): number => c.classes.reduce((t, r) => t + r.lvl, 0);
export const charLevel = (c: { classes: { lvl: number }[] }): number => Math.max(1, totalLevel(c));
// The level in one class ('monk'): its row's level, else (no row for it) the character level.
export const levelIn = (c: Character, cls: string): number => c.classes.find((r) => r.clsId === 'class/' + cls)?.lvl ?? charLevel(c);
// The level a grant or entry reads (spec §1, "Class level"): a class or subclass feature's (its cid, or the cid of the
// feature it comes from) reads its class level; a class row's own grant reads that row's; anything else (a feat,
// species, item, a hand-added feature without cid) the character level. The Proficiency Bonus and cantrip scaling
// always read the total (PHB p.44, Multiclassing).
export function classLevel(c: Character, x?: { from?: string; cid?: string }): number {
  const m = /^(?:feature|subclass)\/([^/]+)\//.exec(x?.cid ?? '');
  if (m) return levelIn(c, m[1]);
  const p = parseLink(x?.from);
  if (p?.kind === 'class') return c.classes.find((r) => r.id === p.id)?.lvl ?? charLevel(c);
  if (p?.kind === 'feature') {
    const cid = c.feats.find((f) => f.id === p.id)?.cid;
    if (cid) return classLevel(c, { cid });
  }
  return charLevel(c);
}

// 'feature:<id>', 'item:<id>', 'spell:<id>' or 'class:<row id>'; anything else is not a link.
export function parseLink(s: unknown): { kind: SourceKind; id: string } | null {
  if (typeof s !== 'string') return null;
  const i = s.indexOf(':');
  const kind = s.slice(0, i) as SourceKind, id = s.slice(i + 1);
  return i > 0 && id && SOURCE_KINDS.includes(kind) ? { kind, id } : null;
}
export const linkOf = (kind: SourceKind, id: string) => kind + ':' + id;

export function sourceOf(c: Character, link: string | undefined): ClassRow | Feature | Item | Spell | null {
  const p = parseLink(link);
  if (!p) return null;
  const list: { id: string }[] = p.kind === 'class' ? (c as { classes?: ClassRow[] }).classes ?? [] : p.kind === 'feature' ? c.feats : p.kind === 'item' ? c.inv : c.spells;
  return (list.find((x) => x.id === p.id) as ClassRow | Feature | Item | Spell | undefined) ?? null;
}

export const GROUP_SRC: Record<FeatureGroup, SrcKind> = {
  class: 'class', sub: 'subclass', feat: 'feat', species: 'species', background: 'background', training: 'other', other: 'other'
};
export function srcKindOfLink(c: Character, link: string): SrcKind | null {
  const src = sourceOf(c, link);
  if (!src) return null;
  const kind = parseLink(link)!.kind;
  return kind === 'feature' ? GROUP_SRC[(src as Feature).g] ?? 'other' : kind;
}

// 'Feat · Magic Initiate' for a link, 'Species · Wood Elf' or 'Wood Elf' for a source named by hand, undefined for
// none. A link to something that no longer exists reads as the hand source, else Other (spec).
export function sourceLabel(c: Character, x: Linked): string | undefined {
  const src = x.from ? sourceOf(c, x.from) : null;
  if (src) return srcLabel(srcKindOfLink(c, x.from!)!) + ' · ' + src.name;
  const hand = [srcLabel(x.srcKind), x.srcName].filter(Boolean).join(' · ');
  return hand || (x.from ? 'Other' : undefined);
}

// A class row has no `from`, so a chain stops there.
const fromOf = (c: Character, link: string) => (parseLink(link)?.kind === 'class' ? undefined : (sourceOf(c, link) as Linked | null)?.from);
// True when linking `self` to `candidate` would close a loop: the candidate is self, or its chain leads back to self.
// The visited set stops on loops already in the data.
export function wouldLoop(c: Character, self: string, candidate: string): boolean {
  const seen = new Set<string>();
  for (let cur: string | undefined = candidate; cur && !seen.has(cur); cur = fromOf(c, cur)) {
    if (cur === self) return true;
    seen.add(cur);
  }
  return false;
}

// Lists whose entries can carry a `from`. Later steps of plan 3 add theirs.
export const LINKED_LISTS = ['senses', 'spells', 'feats', 'attacks', 'grants', 'defenses', 'res'] as const;
type LinkedList = (typeof LINKED_LISTS)[number];

// The fields that mean something only with a link: the item checks, "while its effect is on", the aura it rides on
// (no UI shows or clears needAura on a hand entry) and `linked`.
export function dropLinkOnly<T extends Linked>(x: T): T {
  const { needEq: _e, needAtt: _a, needHand: _h, needAura: _n, linked: _l, ...rest } = x;
  return (rest.when === 'active' ? (({ when: _w, ...r }) => r)(rest) : rest) as T;
}
const unlink = <T extends Linked>(x: T): T => { const { from: _, ...rest } = x; return dropLinkOnly(rest as T); };

// migrate() helper: clears a `from` that names nothing, then breaks loops by clearing the `from` of the first entry
// (features, then spells, in list order) whose chain returns to it. Idempotent.
export function fixLinks(c: Character): Character {
  let out = c;
  const set = (k: LinkedList, list: Linked[]) => { out = { ...out, [k]: list }; };
  for (const k of LINKED_LISTS) {
    const list = out[k] as Linked[];
    const dangling = (x: Linked) => x.from !== undefined && !sourceOf(out, x.from);
    if (list.some(dangling)) set(k, list.map((x) => (dangling(x) ? unlink(x) : x)));
  }
  for (const [k, kind] of [['feats', 'feature'], ['spells', 'spell']] as const) {
    for (const x of out[k] as (Feature | Spell)[]) {
      if (x.from && wouldLoop(out, linkOf(kind, x.id), x.from)) set(k, (out[k] as Linked[]).map((y) => (y === x ? unlink(y) : y)));
    }
  }
  return out;
}

// A Concentration spell cast at range or by touch whose effect can go on someone else (Fly PHB p.276, Gaseous Form
// p.277, Spider Climb p.319, Haste p.284, Beacon of Hope p.245): any of its `when: 'active'` grants or entries, except
// extra damage and auras, which ride on the caster whoever the spell targets. A Self range never targets another, nor
// a ranged spell whose effect is the caster's own (Summon Dragon: "You have Resistance", the range is the spirit's).
const CASTER_ONLY = ['spell/summon-dragon'];
export function effectCanTargetOther(c: Character, sp: Spell): boolean {
  if (!sp.c || /^self/i.test((sp.range || '').trim()) || CASTER_ONLY.includes(sp.cid ?? '')) return false;
  const link = linkOf('spell', sp.id), mine = (x: Linked) => x.from === link && x.when === 'active';
  return c.grants.some((g) => g.kind !== 'xdmg' && g.kind !== 'aura' && mine(g)) || c.defenses.some(mine) || c.senses.some(mine);
}

// Whether a source's effect is switched on. A Concentration spell's is on exactly while concentrating on it, unless it
// was cast on someone else; any other source's while its link is in effectsOn.
export function isOn(c: Character, link: string): boolean {
  const p = parseLink(link);
  const sp = p?.kind === 'spell' ? c.spells.find((x) => x.id === p.id) : undefined;
  return sp?.c ? c.conc?.id === sp.id && !(sp.acOther && effectCanTargetOther(c, sp)) : c.effectsOn.includes(link);
}

// Worn or wielded: equipped and not inside a container (plan 6). The one test every rule reads; the row's equip toggle
// still reads and writes `eq`.
export const isEquipped = (it: Item): boolean => it.eq && !it.in && it.qty >= 1;

// Why an entry or grant doesn't count right now, or null when it counts. Level and armor conditions apply to every
// entry; the item checks, "while its effect is on" and the source's own state need a link. The visited set stops loops.
// Conditions that include Incapacitated (Paralyzed PHB p.371, Petrified p.372, Stunned p.376, Unconscious p.377).
export const INCAPACITATING = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];

// The item, level, armor, "switched on" and source checks run first; Incapacitated (an aura's `incap`) and `needAura`
// only once those pass, so a level-5 Paladin's aura reads "from level 6", not "Incapacitated".
export function inactiveReason(c: Character, x: Linked, seen: Set<string> = new Set()): string | null {
  return baseReason(c, x, seen)
    ?? ((x as { incap?: boolean }).incap && INCAPACITATING.some((n) => c.conds[n]) ? 'Incapacitated' : null)
    ?? auraReason(c, x, seen);
}
// needAura: some aura grant from a feature with that catalog id counts. Each candidate is checked with a copy of `seen`
// plus the aura's key, so a shared set can't skip a check, and an aura that needs itself reads "aura not active".
function auraReason(c: Character, x: Linked, seen: Set<string>): string | null {
  if (!x.needAura) return null;
  const key = 'aura:' + x.needAura;
  if (seen.has(key)) return 'aura not active';
  const links = new Set(c.feats.filter((f) => f.cid === x.needAura).map((f) => linkOf('feature', f.id)));
  const on = c.grants.some((g) => g.kind === 'aura' && links.has(g.from) && inactiveReason(c, g, new Set([...seen, key])) === null);
  return on ? null : 'aura not active';
}
function baseReason(c: Character, x: Linked, seen: Set<string>): string | null {
  if (x.minLvl && x.minLvl > classLevel(c, x)) return 'from level ' + x.minLvl;
  const p = parseLink(x.from);
  if (p?.kind === 'item') {
    const item = c.inv.find((i) => i.id === p.id);
    // Nothing from an item inside a container counts, whatever its item checks (plan 6).
    if (item?.in) return 'in ' + (c.inv.find((i) => i.id === item.in)?.name ?? 'a container');
    // A potion's effect outlives the potion: a switched-on grant still counts at quantity 0, and a Long Rest clears effectsOn.
    if (item && item.qty < 1 && !(x.when === 'active' && isOn(c, x.from!))) return 'none left';
    if (x.needEq && !(item && isEquipped(item))) return 'not equipped';
    if (x.needAtt && !c.attuneIds.includes(p.id)) return 'not attuned';
    if (x.needHand && !c.hands.includes(p.id)) return 'not in hand';
  }
  if (x.when) {
    const eq = c.inv.filter(isEquipped);
    const armor = eq.some((i) => i.armor && i.armor !== 'shield'), shield = eq.some((i) => i.armor === 'shield');
    const why = {
      armor: armor ? null : 'needs armor',
      noHeavy: eq.some((i) => i.armor === 'heavy') ? 'not with Heavy armor' : null,
      noArmor: armor ? 'not with armor' : null,
      noShield: shield ? 'not with a Shield' : null,
      noArmorNoShield: armor || shield ? 'not with armor or a Shield' : null,
      active: x.from && !isOn(c, x.from) ? 'not switched on' : null,
      // "holding no weapons or Shield" (Unarmed Fighting, PHB p.210). A Shield isn't in c.hands.
      empty: c.hands.length > 0 ? 'a weapon is in hand' : shield ? 'not with a Shield' : null
    }[x.when];
    if (why) return why;
  }
  // A class's grants are always on (a row has no conditions of its own).
  if (!x.from || p?.kind === 'item' || p?.kind === 'class' || seen.has(x.from)) return null;
  seen.add(x.from);
  const src = sourceOf(c, x.from) as Linked | null;
  return src ? inactiveReason(c, src, seen) : null;
}
export const isActive = (c: Character, x: Linked) => inactiveReason(c, x) === null;

// The grants of one kind that count now. Counted grants ("Already counted in my numbers") only when asked.
export const activeGrants = (c: Character, kind: GrantKind, withCounted = false): Grant[] =>
  c.grants.filter((g) => g.kind === kind && (withCounted || !g.counted) && isActive(c, g));

// True when something from this link counts only while its effect is on (it then gets an On/Off switch).
export const hasActiveEffect = (c: Character, link: string) =>
  LINKED_LISTS.some((k) => (c[k] as Linked[]).some((x) => x.from === link && x.when === 'active'));

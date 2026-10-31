// Links between entries (plan 3): what an entry came from, how its source reads, and keeping links free of loops.
// Imports types only, so logic.ts can use it without a cycle.
import type { GrantKind } from './catalog/schema';
import type { Character, Feature, FeatureGroup, Grant, Item, Linked, Spell, SrcKind } from './types';

// Kinds of source an entry can name (roadmap, "Source kinds"), with their labels.
export const SRC_KINDS: [SrcKind, string][] = [
  ['species', 'Species'], ['background', 'Background'], ['class', 'Class'], ['subclass', 'Subclass'],
  ['feat', 'Feat'], ['item', 'Item'], ['spell', 'Spell'], ['other', 'Other']
];
const srcLabel = (k: SrcKind | undefined) => SRC_KINDS.find(([x]) => x === k)?.[1];

export type SourceKind = 'feature' | 'item' | 'spell';
const SOURCE_KINDS: SourceKind[] = ['feature', 'item', 'spell'];

// 'feature:<id>', 'item:<id>' or 'spell:<id>'; anything else is not a link.
export function parseLink(s: unknown): { kind: SourceKind; id: string } | null {
  if (typeof s !== 'string') return null;
  const i = s.indexOf(':');
  const kind = s.slice(0, i) as SourceKind, id = s.slice(i + 1);
  return i > 0 && id && SOURCE_KINDS.includes(kind) ? { kind, id } : null;
}
export const linkOf = (kind: SourceKind, id: string) => kind + ':' + id;

export function sourceOf(c: Character, link: string | undefined): Feature | Item | Spell | null {
  const p = parseLink(link);
  if (!p) return null;
  const list: { id: string }[] = p.kind === 'feature' ? c.feats : p.kind === 'item' ? c.inv : c.spells;
  return (list.find((x) => x.id === p.id) as Feature | Item | Spell | undefined) ?? null;
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

const fromOf = (c: Character, link: string) => (sourceOf(c, link) as Linked | null)?.from;
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

// The fields that mean something only with a link: the item checks and "while its effect is on".
export function dropLinkOnly<T extends Linked>(x: T): T {
  const { needEq: _e, needAtt: _a, ...rest } = x;
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
    if (list.some((x) => x.from !== undefined && !sourceOf(out, x.from))) set(k, list.map((x) => (x.from !== undefined && !sourceOf(out, x.from) ? unlink(x) : x)));
  }
  for (const [k, kind] of [['feats', 'feature'], ['spells', 'spell']] as const) {
    for (const x of out[k] as (Feature | Spell)[]) {
      if (x.from && wouldLoop(out, linkOf(kind, x.id), x.from)) set(k, (out[k] as Linked[]).map((y) => (y === x ? unlink(y) : y)));
    }
  }
  return out;
}

// Whether a source's effect is switched on. A Concentration spell's is on exactly while concentrating on it; any other
// source's while its link is in effectsOn.
export function isOn(c: Character, link: string): boolean {
  const p = parseLink(link);
  const sp = p?.kind === 'spell' ? c.spells.find((x) => x.id === p.id) : undefined;
  return sp?.c ? c.conc?.id === sp.id : c.effectsOn.includes(link);
}

// Why an entry or grant doesn't count right now, or null when it counts. Level and armor conditions apply to every
// entry; the item checks, "while its effect is on" and the source's own state need a link. The visited set stops loops.
export function inactiveReason(c: Character, x: Linked, seen: Set<string> = new Set()): string | null {
  if (x.minLvl && x.minLvl > c.level) return 'from level ' + x.minLvl;
  const p = parseLink(x.from);
  if (p?.kind === 'item') {
    const item = c.inv.find((i) => i.id === p.id);
    if (x.needEq && !item?.eq) return 'not equipped';
    if (x.needAtt && !c.attuneIds.includes(p.id)) return 'not attuned';
  }
  if (x.when) {
    const eq = c.inv.filter((i) => i.eq);
    const armor = eq.some((i) => i.armor && i.armor !== 'shield'), shield = eq.some((i) => i.armor === 'shield');
    const why = {
      armor: armor ? null : 'needs armor',
      noHeavy: eq.some((i) => i.armor === 'heavy') ? 'not with Heavy armor' : null,
      noArmor: armor ? 'not with armor' : null,
      noShield: shield ? 'not with a Shield' : null,
      noArmorNoShield: armor || shield ? 'not with armor or a Shield' : null,
      active: x.from && !isOn(c, x.from) ? 'not switched on' : null
    }[x.when];
    if (why) return why;
  }
  if (!x.from || p?.kind === 'item' || seen.has(x.from)) return null;
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

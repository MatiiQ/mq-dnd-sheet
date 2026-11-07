// ChoiceFlow's answers as pure functions (moved from the component): the entries of a flow, what their answers add
// ("Already counted" and link-or-add), and the AddChoices they build. Links resolve against the sheet given
// (findUnlinked), so stored answers replay on a new sheet without naming its ids (the creator's draft).
import { findUnlinked } from '../logic';
import type { Character } from '../types';
import { atLevel, countedDefault, featureName, grantSpellName, isCountable, nestedEntries, resolveChoices, type AddChoices } from './copy';
import type { Catalog } from './merge';
import type { Entry, GrantKind, GrantSpec } from './schema';

// The answers of one entry in the flow, keyed by its path: '' for the entry being added, then '>' + the id of each
// entry nested below it (Elf → '>trait/elf/elven-lineage>trait/elf/wood-elf').
// equip: the entry's starting equipment package (a background's), asked on the flow's last step.
export interface NodeAnswers { picks: Record<string, string[]>; counted: Record<string, boolean>; links: Record<string, 'link' | 'new'>; equip?: 'A' | 'B' | 'none' }
export type FlowAnswers = Record<string, NodeAnswers>;
export interface FlowNode { key: string; parent: string | null; entry: Entry; picks: Record<string, string[]>; preset: Record<string, string[]>; adding: Entry[]; title: string }
export interface CountItem { node: FlowNode; spec: Omit<GrantSpec, 'opt'>; on: boolean }
export interface LinkItem { node: FlowNode; spec: Omit<GrantSpec, 'opt'>; name: string; found: string; choice: 'link' | 'new' | null }

export const EMPTY: NodeAnswers = { picks: {}, counted: {}, links: {} };
// Grant kinds that can link to an entry already on the sheet instead of adding a new one.
export const LINKABLE: Partial<Record<GrantKind, 'resource' | 'spell' | 'action'>> = { resource: 'resource', spell: 'spell', action: 'action' };

// Every entry of the flow, depth first: the entry, then what it nests (a background's feat, a species' traits, the
// lineage picked), each with its answers merged over its preset picks. Choices a preset answers are not asked.
export function flowNodes(cat: Catalog, c: Character, entry: Entry, answers: FlowAnswers, preset: Record<string, string[]> = {}): FlowNode[] {
  const out: FlowNode[] = [];
  const walk = (e0: Entry, key: string, parent: string | null, pre: Record<string, string[]>, adding: Entry[]) => {
    const picks = { ...pre, ...(answers[key]?.picks ?? {}) };
    const e = atLevel(c, e0);
    const node: FlowNode = { key, parent, entry: e, picks, preset: pre, adding: [...adding, e], title: featureName(cat, c, e, picks) };
    out.push(node);
    for (const n of nestedEntries(cat, e, picks)) walk(n.entry, key + '>' + n.entry.id, key, n.preset ?? {}, node.adding);
  };
  walk(entry, '', null, preset, []);
  return out;
}

// What the answers add, for the last step's questions: the countable grants and the links to entries already there.
export function flowReview(cat: Catalog, c: Character, nodes: FlowNode[], answers: FlowAnswers): { counts: CountItem[]; links: LinkItem[] } {
  const counts: CountItem[] = [], links: LinkItem[] = [];
  for (const node of nodes) {
    const own = answers[node.key] ?? EMPTY;
    for (const spec of resolveChoices(cat, node.entry, node.picks, c).specs) {
      if (isCountable(spec)) counts.push({ node, spec, on: own.counted[spec.id] ?? countedDefault(c, node.entry, spec) });
      const kind = LINKABLE[spec.kind];
      const name = spec.kind === 'spell' ? grantSpellName(cat, spec) : spec.name;
      // An item's spell is cast from the item (its charges, its DC), so it is always its own row, never a link.
      const found = kind && !(spec.kind === 'spell' && node.entry.kind === 'item') ? findUnlinked(c, kind, name) : null;
      // Plan 3's defaults: link a resource or an action of the same name; a spell asks.
      if (found) links.push({ node, spec, name, found, choice: own.links[spec.id] ?? (spec.kind === 'spell' ? null : 'link') });
    }
  }
  return { counts, links };
}

// The AddChoices addFromCatalog takes, from the flow's answers.
export function buildChoices(cat: Catalog, c: Character, entry: Entry, answers: FlowAnswers, preset: Record<string, string[]> = {}): AddChoices {
  const nodes = flowNodes(cat, c, entry, answers, preset);
  const { counts, links } = flowReview(cat, c, nodes, answers);
  const out = new Map<string, AddChoices>();
  for (const node of nodes) {
    const own = answers[node.key] ?? EMPTY;
    const counted: Record<string, boolean> = {};
    for (const x of counts) if (x.node.key === node.key && x.on) counted[x.spec.id] = true;
    const linked: Record<string, string> = {};
    for (const x of links) if (x.node.key === node.key && x.choice === 'link') linked[x.spec.id] = x.found;
    out.set(node.key, { picks: { ...node.preset, ...own.picks }, counted, links: linked, ...(node.key === '' && own.equip ? { equip: own.equip } : {}) });
  }
  for (const node of nodes) {
    if (node.parent === null) continue;
    const p = out.get(node.parent)!;
    p.nested = { ...p.nested, [node.entry.id]: out.get(node.key)! };
  }
  return out.get('')!;
}

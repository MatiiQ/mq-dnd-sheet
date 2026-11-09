// ChoiceFlow's answers as pure functions (moved from the component): the entries of a flow, what their answers add
// ("Already counted" and link-or-add), and the AddChoices they build. Links resolve against the sheet given
// (findUnlinked), so stored answers replay on a new sheet without naming its ids (the creator's draft).
import { findUnlinked } from '../logic';
import type { Ability, Character } from '../types';
import { atLevel, blocksPick, choiceActive, choiceOptions, choicesOf, countedDefault, featureName, grantSpellName, isCountable, livePicks, nestedEntries, pickCap, resolveChoices, validPicks, type AddChoices } from './copy';
import type { Catalog } from './merge';
import type { ChoiceSpec, Entry, GrantKind, GrantSpec } from './schema';

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

// noCounts: no "Already counted" question and nothing counted. noLinks: no link question; every entry found is linked.
export interface ReviewOpts { noCounts?: boolean; noLinks?: boolean }
// What the answers add, for the last step's questions: the countable grants and the links to entries already there.
export function flowReview(cat: Catalog, c: Character, nodes: FlowNode[], answers: FlowAnswers, opts: ReviewOpts = {}): { counts: CountItem[]; links: LinkItem[] } {
  const counts: CountItem[] = [], links: LinkItem[] = [];
  for (const node of nodes) {
    const own = answers[node.key] ?? EMPTY;
    for (const spec of resolveChoices(cat, node.entry, node.picks, c).specs) {
      if (isCountable(spec) && !opts.noCounts) counts.push({ node, spec, on: own.counted[spec.id] ?? countedDefault(c, node.entry, spec) });
      const kind = LINKABLE[spec.kind];
      const name = spec.kind === 'spell' ? grantSpellName(cat, spec) : spec.name;
      // An item's spell is cast from the item (its charges, its DC), so it is always its own row, never a link.
      const found = kind && !(spec.kind === 'spell' && node.entry.kind === 'item') ? findUnlinked(c, kind, name) : null;
      // Plan 3's defaults: link a resource or an action of the same name; a spell asks.
      if (found) links.push({ node, spec, name, found, choice: opts.noLinks ? 'link' : own.links[spec.id] ?? (spec.kind === 'spell' ? null : 'link') });
    }
  }
  return { counts, links };
}

// The AddChoices addFromCatalog takes, from the flow's answers.
export function buildChoices(cat: Catalog, c: Character, entry: Entry, answers: FlowAnswers, preset: Record<string, string[]> = {}, opts: ReviewOpts = {}): AddChoices {
  const nodes = flowNodes(cat, c, entry, answers, preset);
  const { counts, links } = flowReview(cat, c, nodes, answers, opts);
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

// ---- The flow's steps as pure functions (ChoiceFlow, the creator and the level-up wizard share them) ----

// preset: answered choices of the entry; skipChoices: the entry's own choices not asked here (node '' only);
// noEquip: no starting equipment step; held: options already on the sheet (blocked); pick: a choice id → the count owed.
export interface ChoiceOpts extends ReviewOpts { preset?: Record<string, string[]>; skipChoices?: string[]; noEquip?: boolean; held?: string[]; pick?: Record<string, number> }
// review: the "Already counted" and link questions of the entry (with its preset, to rebuild the flow's nodes).
export type ChoiceStep = { kind: 'choice'; node: FlowNode; choice: ChoiceSpec } | { kind: 'equip'; node: FlowNode } | { kind: 'review'; entry: Entry; preset: Record<string, string[]> };

// The steps of an entry's flow, in ChoiceFlow's order: its choices (depth first), the review, then the starting equipment.
export function choiceSteps(cat: Catalog, c: Character, entry: Entry, answers: FlowAnswers, opts: ChoiceOpts = {}): ChoiceStep[] {
  const preset = opts.preset ?? {};
  const nodes = flowNodes(cat, c, entry, answers, preset);
  const steps: ChoiceStep[] = nodes.flatMap((node) => choicesOf(node.entry)
    .filter((ch) => !node.preset[ch.id] && choiceActive(node.entry, ch, node.picks) && !(node.key === '' && opts.skipChoices?.includes(ch.id)))
    .map((choice) => ({ kind: 'choice' as const, node, choice })));
  const { counts, links } = flowReview(cat, c, nodes, answers, opts);
  if (counts.length > 0 || (!opts.noLinks && links.length > 0)) steps.push({ kind: 'review', entry, preset });
  const root = nodes[0];
  if (!opts.noEquip && root.entry.kind === 'background' && root.entry.equipA !== undefined) steps.push({ kind: 'equip', node: root });
  return steps;
}

export const choiceKey = (s: ChoiceStep): string => (s.kind === 'choice' ? `${s.node.key || '_'}/${s.choice.id}` : s.kind);

// The node's picks under the current answers (a step keeps the node it was listed with).
const picksNow = (node: FlowNode, answers: FlowAnswers) => ({ ...node.preset, ...(answers[node.key]?.picks ?? {}) });

// The picks a choice step owes: the pick override or the choice's count, capped by what can be picked (the same rule as
// needed(), with held options blocked too and a blocked stored pick left out). Without held or pick it equals needed().
export function choiceNeed(cat: Catalog, c: Character, node: FlowNode, choice: ChoiceSpec, opts: ChoiceOpts = {}, picks = node.picks): number {
  const base = opts.pick?.[choice.id] ?? choice.pick;
  const options = choiceOptions(cat, c, choice, picks, node.adding);
  if (!options || (choice.options && !opts.held)) return base;
  return pickCap(choice, base, options, livePicks(cat, c, choice, picks, node.adding), opts.held, false);
}

// Whether a step can go on, and what is left when it can't.
export function choiceStepReady(cat: Catalog, c: Character, step: ChoiceStep, answers: FlowAnswers, opts: ChoiceOpts = {}): { ready: boolean; missing?: string } {
  if (step.kind === 'equip') return answers[step.node.key]?.equip ? { ready: true } : { ready: false, missing: 'Choose a starting equipment option' };
  if (step.kind === 'review') {
    const nodes = flowNodes(cat, c, step.entry, answers, step.preset);
    const open = flowReview(cat, c, nodes, answers, opts).links.find((x) => x.choice === null);
    return open ? { ready: false, missing: `Answer the question about ${open.name}` } : { ready: true };
  }
  const { node, choice } = step;
  const picks = picksNow(node, answers);
  const valid = validPicks(choice, livePicks(cat, c, choice, picks, node.adding));
  const options = choiceOptions(cat, c, choice, picks, node.adding) ?? [];
  const blocked = valid.find((v) => blocksPick(v, { held: opts.held, option: options.find((o) => o.value === v) }));
  if (blocked !== undefined) return { ready: false, missing: `Already on your sheet: ${options.find((o) => o.value === blocked)?.label ?? blocked}` };
  const need = choiceNeed(cat, c, node, choice, opts, picks);
  if (valid.length >= need) return { ready: true };
  return { ready: false, missing: valid.length ? `Choose ${need - valid.length} more` : `Choose ${need}` };
}

// A tap on an option: adds it while there is room (a second time only with repeat), else takes it out again; a pick-1
// choice swaps. A blocked option (blocksPick) only comes out. null: no change.
export function togglePick(choice: ChoiceSpec, cur: string[], v: string, o: { blocked: boolean; cap?: number }): string[] | null {
  const n = cur.filter((x) => x === v).length;
  if (o.blocked) return n > 0 ? cur.filter((x) => x !== v) : null;
  const added = [...cur, v];
  if (validPicks(choice, added).length === added.length && (o.cap === undefined || added.length <= o.cap) && (n === 0 || choice.repeat)) return added;
  if (n > 0) return cur.filter((x) => x !== v);
  if (choice.pick === 1) return [v];
  return null;
}

// The spellcasting ability a feat's spells start with: the class's, when offered; else Intelligence; else the first.
export function spellAbilityDefault(options: string[], castAb?: Ability): string {
  return castAb && options.includes(castAb) ? castAb : options.includes('int') ? 'int' : options[0];
}

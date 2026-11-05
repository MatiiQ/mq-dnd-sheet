import { useEffect, useState } from 'react';
import {
  atLevel, choiceActive, choicesOf, countedDefault, featureName, freeText, grantSpellName, isCountable, livePicks, needed, nestedEntries, optionGroups, poolOptions, resolveChoices,
  validPicks, type AddChoices
} from '../../catalog/copy';
import type { Catalog } from '../../catalog/merge';
import type { ChoiceSpec, Entry, GrantSpec } from '../../catalog/schema';
import { findUnlinked, normName } from '../../logic';
import { useSheet } from '../../sheet';
import type { Character } from '../../types';
import { LINKABLE, LinkOrAdd } from '../GrantEditor';

// The answers of one entry in the flow, keyed by its path: '' for the entry being added, then '>' + the id of each
// entry nested below it (Elf → '>trait/elf/elven-lineage>trait/elf/wood-elf').
interface NodeAnswers { picks: Record<string, string[]>; counted: Record<string, boolean>; links: Record<string, 'link' | 'new'> }
// Where the flow stood when it handed its answers on: given back as `initial`, it starts there again (Back from the item
// questions). total: its step count, 0 when it had nothing to ask.
export interface FlowState { answers: Record<string, NodeAnswers>; at: number; total?: number }
interface FlowNode { key: string; parent: string | null; entry: Entry; picks: Record<string, string[]>; preset: Record<string, string[]>; adding: Entry[]; title: string }
interface ChoiceStep { node: FlowNode; choice: ChoiceSpec }
interface CountItem { node: FlowNode; spec: Omit<GrantSpec, 'opt'>; on: boolean }
interface LinkItem { node: FlowNode; spec: Omit<GrantSpec, 'opt'>; name: string; found: string; choice: 'link' | 'new' | null }

const EMPTY: NodeAnswers = { picks: {}, counted: {}, links: {} };

// Every entry of the flow, depth first: the entry, then what it nests (a background's feat, a species' traits, the
// lineage picked), each with its answers merged over its preset picks. Choices a preset answers are not asked.
function walk(cat: Catalog, c: Character, answers: Record<string, NodeAnswers>, entry: Entry, key: string, parent: string | null,
  preset: Record<string, string[]>, adding: Entry[], out: FlowNode[]): void {
  const picks = { ...preset, ...(answers[key]?.picks ?? {}) };
  entry = atLevel(c, entry);
  const node: FlowNode = { key, parent, entry, picks, preset, adding: [...adding, entry], title: featureName(cat, c, entry, picks) };
  out.push(node);
  for (const n of nestedEntries(cat, entry, picks)) walk(cat, c, answers, n.entry, key + '>' + n.entry.id, key, n.preset ?? {}, node.adding, out);
}

// Asks a catalog entry's choices, then the "Already counted" switches and the link-or-add questions of what it will
// add, and hands the answers to onDone (addFromCatalog's AddChoices) with where it stood. An entry with nothing to ask
// goes straight through.
export function ChoiceFlow({ entry, cat, preset, initial, onDone, onCancel }: {
  entry: Entry; cat: Catalog; preset?: Record<string, string[]>; initial?: FlowState; onDone: (ans: AddChoices, state: FlowState) => void; onCancel: () => void;
}) {
  const { c } = useSheet();
  const [answers, setAnswers] = useState<Record<string, NodeAnswers>>(initial?.answers ?? {});
  const [at, setAt] = useState(initial?.at ?? 0);
  const [query, setQuery] = useState('');

  const nodes: FlowNode[] = [];
  walk(cat, c, answers, entry, '', null, preset ?? {}, [], nodes);
  const steps: ChoiceStep[] = nodes.flatMap((node) => choicesOf(node.entry).filter((ch) => !node.preset[ch.id] && choiceActive(node.entry, ch, node.picks)).map((choice) => ({ node, choice })));
  // What the answers add, for the last step's questions.
  const counts: CountItem[] = [], links: LinkItem[] = [];
  for (const node of nodes) {
    const own = answers[node.key] ?? EMPTY;
    for (const spec of resolveChoices(cat, node.entry, node.picks, c).specs) {
      if (isCountable(spec)) counts.push({ node, spec, on: own.counted[spec.id] ?? countedDefault(c, node.entry, spec) });
      const kind = LINKABLE[spec.kind];
      const name = spec.kind === 'spell' ? grantSpellName(cat, spec) : spec.name;
      const found = kind ? findUnlinked(c, kind, name) : null;
      // Plan 3's defaults: link a resource or an action of the same name; a spell asks.
      if (found) links.push({ node, spec, name, found, choice: own.links[spec.id] ?? (spec.kind === 'spell' ? null : 'link') });
    }
  }
  const review = counts.length > 0 || links.length > 0;
  const total = steps.length + (review ? 1 : 0);
  const idx = Math.min(at, Math.max(0, total - 1));

  const build = (): AddChoices => {
    const out = new Map<string, AddChoices>();
    for (const node of nodes) {
      const own = answers[node.key] ?? EMPTY;
      const counted: Record<string, boolean> = {};
      for (const x of counts) if (x.node.key === node.key && x.on) counted[x.spec.id] = true;
      const linked: Record<string, string> = {};
      for (const x of links) if (x.node.key === node.key && x.choice === 'link') linked[x.spec.id] = x.found;
      out.set(node.key, { picks: { ...node.preset, ...own.picks }, counted, links: linked });
    }
    for (const node of nodes) {
      if (node.parent === null) continue;
      const p = out.get(node.parent)!;
      p.nested = { ...p.nested, [node.entry.id]: out.get(node.key)! };
    }
    return out.get('')!;
  };

  // Nothing to ask: add at once.
  useEffect(() => { if (total === 0) onDone(build(), { answers, at: 0, total: 0 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (total === 0) return null;

  const setNode = (key: string, f: (n: NodeAnswers) => NodeAnswers) => setAnswers((a) => ({ ...a, [key]: f(a[key] ?? EMPTY) }));
  // A new pick clears the picks of choices whose pool names it ($list), so Magic Initiate's cantrips follow its list.
  const setPicks = (node: FlowNode, ch: ChoiceSpec, vals: string[]) => setNode(node.key, (n) => {
    const picks = { ...n.picks, [ch.id]: vals };
    for (const other of choicesOf(node.entry)) if (other.pool?.includes('$' + ch.id)) delete picks[other.id];
    return { ...n, picks };
  });

  const step = idx < steps.length ? steps[idx] : null;
  let ready = true, body = null;
  if (step) {
    const { node, choice } = step;
    const cur = livePicks(cat, c, choice, node.picks, node.adding);
    const valid = validPicks(choice, cur);
    const need = needed(cat, c, choice, node.picks, node.adding);
    ready = valid.length >= need;
    const count = (v: string) => cur.filter((x) => x === v).length;
    // A tap adds the option while there is room (a second time only with repeat), else takes it out again.
    const toggle = (v: string) => {
      const n = count(v);
      const added = [...cur, v];
      if (validPicks(choice, added).length === added.length && (n === 0 || choice.repeat)) setPicks(node, choice, added);
      else if (n > 0) setPicks(node, choice, cur.filter((x) => x !== v));
      else if (choice.pick === 1) setPicks(node, choice, [v]);
    };
    const optButton = (value: string, label: string, extra?: string, warn?: boolean) => (
      <button key={value} type="button" className="pick-opt" aria-pressed={count(value) > 0} onClick={() => toggle(value)}>
        <span className="col">
          <span>{label}{count(value) > 1 ? ' ×' + count(value) : ''}</span>
          {extra && <span className={warn ? 'small picker-warn' : 'small'}>{extra}</span>}
        </span>
      </button>
    );
    let list = null;
    if (choice.options) {
      list = <div className="row wrap gap-6">{optionGroups(choice).map((g) => optButton(g.value, g.label))}</div>;
    } else if (choice.pool && freeText(cat, c, choice.pool, node.picks)) {
      list = (
        <div className="col gap-6">
          {Array.from({ length: choice.pick }, (_, i) => (
            <input key={i} type="text" className="input" aria-label={choice.name + ' ' + (i + 1)} value={cur[i] ?? ''} placeholder="Type a name"
              onChange={(e) => { const next = Array.from({ length: choice.pick }, (_, j) => cur[j] ?? ''); next[i] = e.target.value; setPicks(node, choice, next); }} />
          ))}
        </div>
      );
    } else if (choice.pool) {
      const opts = poolOptions(cat, c, choice.pool, node.picks, node.adding);
      const q = normName(query);
      const shown = q ? opts.filter((o) => normName(o.label).includes(q)) : opts;
      list = opts.length === 0 ? <span className="muted">No option qualifies.</span> : (
        <div className="col gap-6">
          {opts.length > 12 && <input type="search" className="input" aria-label="Search the options" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />}
          <div className="row wrap gap-6">
            {shown.map((o) => optButton(o.value, o.label, o.unmet ? 'Needs ' + o.unmet.join(', ') : o.taken ? 'On the sheet' : undefined, !!o.unmet))}
          </div>
        </div>
      );
    }
    body = (
      <>
        <span className="label">{node.title}</span>
        <h4 className="pick-title">{choice.name} <span className="muted">· choose {choice.pick}</span></h4>
        {need < choice.pick && need > 0 && <span className="small">Only {need} {need === 1 ? 'option qualifies' : 'options qualify'}.</span>}
        {list}
      </>
    );
  } else {
    ready = links.every((x) => x.choice !== null);
    body = (
      <>
        <span className="label">{nodes[0].title}</span>
        {counts.length > 0 && (
          <div className="col gap-4">
            <h4 className="pick-title">Already counted in my numbers?</h4>
            <span className="small">Switch on what your typed scores, speed or AC already include.</span>
            {counts.map((x) => (
              <label key={x.node.key + x.spec.id} className="check">
                <input type="checkbox" checked={x.on} onChange={(e) => setNode(x.node.key, (n) => ({ ...n, counted: { ...n.counted, [x.spec.id]: e.target.checked } }))} />
                {x.spec.name}{x.node.key ? ' (' + x.node.title + ')' : ''}
              </label>
            ))}
            {counts.some((x) => x.spec.kind === 'ac') && c.acMods.length > 0 && (
              <span className="small">Custom AC bonuses already on the sheet: {c.acMods.map((m) => m.name).join(', ')}.</span>
            )}
          </div>
        )}
        {links.map((x) => (
          <div key={x.node.key + x.spec.id} className="col gap-4">
            <span>You already have ‘{x.name}’.</span>
            <LinkOrAdd name={x.name} value={x.choice} onChange={(v) => setNode(x.node.key, (n) => ({ ...n, links: { ...n.links, [x.spec.id]: v } }))} />
          </div>
        ))}
      </>
    );
  }
  const last = idx === total - 1;
  return (
    <div className="col gap-8 choice-flow" role="group" aria-label={'Choices for ' + entry.name}>
      {body}
      <div className="row wrap gap-8">
        {idx > 0 && <button type="button" className="btn" onClick={() => { setAt(idx - 1); setQuery(''); }}>Back</button>}
        <button type="button" className="btn btn-primary" aria-disabled={!ready}
          onClick={() => { if (!ready) return; if (last) onDone(build(), { answers, at: idx, total }); else { setAt(idx + 1); setQuery(''); } }}>{last ? 'Add' : 'Next'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <span className="small">Step {idx + 1} of {total}</span>
      </div>
    </div>
  );
}

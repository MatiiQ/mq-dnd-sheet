import { useEffect, useState } from 'react';
import { choiceActive, choicesOf, equipText, freeText, livePicks, needed, optionGroups, poolOptions, validPicks, type AddChoices } from '../../catalog/copy';
import { buildChoices, EMPTY, flowNodes, flowReview, type FlowNode, type NodeAnswers } from '../../catalog/flow';
import type { Catalog } from '../../catalog/merge';
import type { ChoiceSpec, Entry } from '../../catalog/schema';
import { normName } from '../../logic';
import { useSheet } from '../../sheet';
import { LinkOrAdd } from '../GrantEditor';

// Where the flow stood when it handed its answers on: given back as `initial`, it starts there again (Back from the item
// questions). total: its step count, 0 when it had nothing to ask.
export interface FlowState { answers: Record<string, NodeAnswers>; at: number; total?: number }
interface ChoiceStep { node: FlowNode; choice: ChoiceSpec }

// Asks a catalog entry's choices, then the "Already counted" switches and the link-or-add questions of what it will
// add, and hands the answers to onDone (addFromCatalog's AddChoices) with where it stood. An entry with nothing to ask
// goes straight through. held: options already on the sheet, shown crossed out and not selectable (the level-up wizard);
// pick: a choice id → the count owed now, instead of the choice's own count (Metamagic +2 at level 10).
export function ChoiceFlow({ entry, cat, preset, initial, held, pick, onDone, onCancel }: {
  entry: Entry; cat: Catalog; preset?: Record<string, string[]>; initial?: FlowState; held?: string[]; pick?: Record<string, number>;
  onDone: (ans: AddChoices, state: FlowState) => void; onCancel: () => void;
}) {
  const { c } = useSheet();
  const [answers, setAnswers] = useState<Record<string, NodeAnswers>>(initial?.answers ?? {});
  const [at, setAt] = useState(initial?.at ?? 0);
  const [query, setQuery] = useState('');

  const nodes = flowNodes(cat, c, entry, answers, preset);
  const steps: ChoiceStep[] = nodes.flatMap((node) => choicesOf(node.entry).filter((ch) => !node.preset[ch.id] && choiceActive(node.entry, ch, node.picks)).map((choice) => ({ node, choice })));
  // What the answers add, for the last step's questions.
  const { counts, links } = flowReview(cat, c, nodes, answers);
  const review = counts.length > 0 || links.length > 0;
  const bg = nodes[0].entry.kind === 'background' && nodes[0].entry.equipA !== undefined ? nodes[0].entry : null;
  const total = steps.length + (review ? 1 : 0) + (bg ? 1 : 0);
  const idx = Math.min(at, Math.max(0, total - 1));

  const build = (): AddChoices => buildChoices(cat, c, entry, answers, preset);

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
  if (bg && idx === total - 1) {
    const cur = answers['']?.equip;
    ready = !!cur;
    const opt = (v: 'A' | 'B' | 'none', label: string, extra: string) => (
      <button key={v} type="button" className="pick-opt" aria-pressed={cur === v} onClick={() => setNode('', (n) => ({ ...n, equip: v }))}>
        <span className="col"><span>{label}</span><span className="small">{extra}</span></span>
      </button>
    );
    body = (
      <>
        <span className="label">{nodes[0].title}</span>
        <h4 className="pick-title">Starting equipment</h4>
        <div className="col gap-6">{opt('A', 'Package A', equipText(cat, bg))}{opt('B', 'Package B', `${bg.gpB ?? 0} GP`)}{opt('none', 'Skip', 'Add no items or coins')}</div>
      </>
    );
  } else if (step) {
    const { node, choice } = step;
    const cur = livePicks(cat, c, choice, node.picks, node.adding);
    const valid = validPicks(choice, cur);
    const need = pick?.[choice.id] ?? needed(cat, c, choice, node.picks, node.adding);
    ready = valid.length >= need;
    const count = (v: string) => cur.filter((x) => x === v).length;
    // A tap adds the option while there is room (a second time only with repeat), else takes it out again.
    const toggle = (v: string) => {
      const n = count(v);
      const added = [...cur, v];
      if (held?.includes(v)) return;
      if (validPicks(choice, added).length === added.length && (pick?.[choice.id] === undefined || added.length <= pick[choice.id]) && (n === 0 || choice.repeat)) setPicks(node, choice, added);
      else if (n > 0) setPicks(node, choice, cur.filter((x) => x !== v));
      else if (choice.pick === 1) setPicks(node, choice, [v]);
    };
    const optButton = (value: string, label: string, extra?: string, warn?: boolean) => (
      <button key={value} type="button" className="pick-opt" aria-pressed={count(value) > 0} aria-disabled={held?.includes(value) || undefined}
        style={held?.includes(value) ? { textDecoration: 'line-through', color: 'var(--off)' } : undefined} onClick={() => toggle(value)}>
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
        <h4 className="pick-title">{choice.name} <span className="muted">· choose {pick?.[choice.id] ?? choice.pick}</span></h4>
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

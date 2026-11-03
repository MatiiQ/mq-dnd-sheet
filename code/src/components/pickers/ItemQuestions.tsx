import { useState } from 'react';
import { itemQuestions, type ItemAnswers, type ItemQuestion } from '../../catalog/copy';
import type { Catalog } from '../../catalog/merge';
import type { Entry } from '../../catalog/schema';

// The item questions of the add flow (plan 7), after ChoiceFlow's steps, one step per question in the order base,
// bonus, charges, with ChoiceFlow's Back/Next/Add frame. Back on the first question goes back to ChoiceFlow (onBack).
export function ItemQuestions({ entry, cat, onDone, onBack, onCancel }: {
  entry: Entry; cat: Catalog; onDone: (item: ItemAnswers) => void; onBack: () => void; onCancel: () => void;
}) {
  const qs = itemQuestions(cat, entry);
  const [at, setAt] = useState(0);
  const [a, setA] = useState<ItemAnswers>({});
  const q: ItemQuestion | undefined = qs[at];
  if (!q) return null;
  const answered = (x: ItemQuestion) => x.key === 'charges'
    ? Number.isInteger(a.charges) && a.charges! >= x.min! && a.charges! <= x.max!
    : x.key === 'bonus' ? a.bonus !== undefined : a.base !== undefined;
  const ready = answered(q);
  const last = at === qs.length - 1;
  const pick = (v: string) => setA((x) => (q.key === 'bonus' ? { ...x, bonus: Number(v) as 1 | 2 | 3 } : { ...x, base: v }));
  const chosen = (v: string) => (q.key === 'bonus' ? String(a.bonus) === v : a.base === v);
  return (
    <div className="col gap-8 choice-flow" role="group" aria-label={'Choices for ' + entry.name}>
      <span className="label">{entry.name}</span>
      <h4 className="pick-title">{q.label}</h4>
      {q.key === 'charges' ? (
        <input type="number" className="input" inputMode="numeric" aria-label={q.label} min={q.min} max={q.max} value={a.charges ?? ''}
          onChange={(e) => setA((x) => ({ ...x, charges: e.target.value === '' ? undefined : Number(e.target.value) }))} />
      ) : (
        <div className="row wrap gap-6">
          {q.options!.map((o) => (
            <button key={o.value} type="button" className="pick-opt" aria-pressed={chosen(o.value)} onClick={() => pick(o.value)}>
              <span className="col"><span>{o.label}</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="row wrap gap-8">
        <button type="button" className="btn" onClick={() => (at > 0 ? setAt(at - 1) : onBack())}>Back</button>
        <button type="button" className="btn btn-primary" aria-disabled={!ready}
          onClick={() => { if (!ready) return; if (last) onDone(a); else setAt(at + 1); }}>{last ? 'Add' : 'Next'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <span className="small">Step {at + 1} of {qs.length}</span>
      </div>
    </div>
  );
}

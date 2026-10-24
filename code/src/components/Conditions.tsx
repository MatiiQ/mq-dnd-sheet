import { CONDITIONS, CONDITION_RULES, setExhaustion, toggleCondition } from '../logic';
import { useSheet } from '../sheet';

export function Conditions() {
  const { c, update } = useSheet();
  const rules = CONDITIONS.filter((n) => c.conds[n]).map((n) => ({ name: n, text: CONDITION_RULES[n], dead: false }));
  if (c.exh >= 6) rules.push({ name: 'Exhaustion 6', text: 'The character dies.', dead: true });
  else if (c.exh > 0) rules.push({
    name: 'Exhaustion ' + c.exh, dead: false,
    text: 'Subtract ' + c.exh * 2 + ' from every D20 Test (attack rolls, ability checks, saving throws). Speed −' + c.exh * 5 + ' ft, already applied. A Long Rest removes 1 level.'
  });

  return (
    <section id="sec-conditions" aria-label="Conditions" className="card section row wrap gap-8" style={{ flexDirection: 'row', alignItems: 'center', padding: '10px 14px' }}>
      <span className="caps" style={{ marginRight: 4 }}>CONDITIONS</span>
      {CONDITIONS.map((n) => (
        <button key={n} type="button" className="chip" aria-pressed={!!c.conds[n]} onClick={() => update((p) => toggleCondition(p, n))}>{n}</button>
      ))}
      <div className="row gap-6" style={{ marginLeft: 'auto', border: '1px solid var(--line-2)', borderRadius: 10, paddingLeft: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Exhaustion <strong style={{ color: 'var(--accent)' }}>{c.exh}</strong> / 6</span>
        <button type="button" className="step" style={{ border: 'none', borderRadius: 0 }} aria-label="Decrease exhaustion" onClick={() => update((p) => setExhaustion(p, p.exh - 1))}>−</button>
        <button type="button" className="step" style={{ border: 'none', borderRadius: '0 10px 10px 0' }} aria-label="Increase exhaustion" onClick={() => update((p) => setExhaustion(p, p.exh + 1))}>+</button>
      </div>
      {rules.length > 0 && (
        <ul aria-label="Active condition effects" className="col gap-6" style={{ flex: '1 1 100%', listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
          {rules.map((r) => (
            <li key={r.name} className="notice" style={{ background: r.dead ? 'var(--dead-bg)' : 'var(--cond-bg)', color: r.dead ? 'var(--dead-fg)' : 'var(--cond-fg)' }}>
              <strong>{r.name}</strong> · {r.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

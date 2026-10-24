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
    <section id="sec-conditions" aria-label="Conditions" className="block section">
      <h2 className="block-title area-title">Conditions</h2>
      <div className="row wrap gap-8">
        {CONDITIONS.map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={!!c.conds[n]} onClick={() => update((p) => toggleCondition(p, n))}>{n}</button>
        ))}
        <div className="row amount" style={{ marginLeft: 'auto', paddingLeft: 14 }}>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Exhaustion <strong style={{ color: 'var(--accent)' }}>{c.exh}</strong> / 6</span>
          <button type="button" className="step" aria-label="Decrease exhaustion" onClick={() => update((p) => setExhaustion(p, p.exh - 1))}>−</button>
          <button type="button" className="step" aria-label="Increase exhaustion" onClick={() => update((p) => setExhaustion(p, p.exh + 1))}>+</button>
        </div>
      </div>
      {rules.length > 0 && (
        <ul aria-label="Active condition effects" className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
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
